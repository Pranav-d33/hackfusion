
import os
import json
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from evaluation.store import save_metrics

# Use free models to keep costs at zero
EVAL_MODEL = "mistralai/mistral-7b-instruct:free"
# Fallback model if the first one fails
FALLBACK_MODEL = "google/gemma-2-9b-it:free"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

class RagasEvaluator:
    """
    Lightweight RAG evaluator that mimics RAGAS metrics using direct LLM calls.
    Designed for production safety and zero-dependency bloat.
    """
    
    def __init__(self):
        if not OPENROUTER_API_KEY:
            print("⚠️ OPENROUTER_API_KEY not found. Evaluation will fail.")
            
    async def _call_llm(self, prompt: str, model: str = EVAL_MODEL, retries: int = 2) -> str:
        """Call OpenRouter LLM with retries."""
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mediloon.ai", # Required by OpenRouter for free tier
            "X-Title": "Mediloon Eval",
        }
        
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0, # Deterministic for eval
             "max_tokens": 500,
        }
        
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                    response.raise_for_status()
                    data = response.json()
                    content = data["choices"][0]["message"]["content"]
                    return content.strip()
            except Exception as e:
                print(f"⚠️ LLM call failed (attempt {attempt+1}/{retries+1}): {e}")
                if attempt == retries:
                    # Try fallback model on last attempt
                    if model == EVAL_MODEL:
                        print(f"🔄 Switching to fallback model: {FALLBACK_MODEL}")
                        return await self._call_llm(prompt, model=FALLBACK_MODEL, retries=0)
                    return ""
                await asyncio.sleep(2) # Backoff
        
        return ""

    async def evaluate_faithfulness(self, question: str, context: List[str], answer: str) -> float:
        """
        Measure if the answer is derived purely from the context.
        Score: 0.0 to 1.0
        """
        if not context:
            return 0.0
            
        context_text = "\n".join([f"- {c}" for c in context])
        
        prompt = f"""
        You are a strict judge evaluating a RAG system.
        
        CONTEXT:
        {context_text}
        
        QUESTION: {question}
        
        ANSWER: {answer}
        
        TASK:
        Analyze if the ANSWER is entirely supported by the CONTEXT.
        Identify any hallucinated statements (claims in Answer not found in Context).
        
        OUTPUT FORMAT:
        Return ONLY a JSON object with:
        {{
            "reasoning": "Brief explanation...",
            "score": <float between 0.0 and 1.0>
        }}
        1.0 means fully faithful. 0.0 means complete hallucination.
        """
        
        response = await self._call_llm(prompt)
        try:
            # Extract JSON from potential markdown blocks
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                response = response.split("```")[1].split("```")[0].strip()
                
            data = json.loads(response)
            return float(data.get("score", 0.0))
        except Exception:
            print(f"❌ Failed to parse faithfulness score. Response: {response}")
            return 0.0

    async def evaluate_context_precision(self, question: str, context: List[str], ground_truth: str = None) -> float:
        """
        Measure if the retrieved context contains the necessary information.
        Score: 0.0 to 1.0
        If ground_truth is missing, we estimate relevance to question.
        """
        if not context:
            return 0.0
            
        context_text = "\n".join([f"{i+1}. {c}" for i, c in enumerate(context)])
        
        prompt = f"""
        You are a strict judge evaluating search results.
        
        QUESTION: {question}
        
        RETRIEVED CONTEXTS:
        {context_text}
        
        TASK:
        Rate how relevant the retrieved contexts are for answering the question.
        Are there irrelevant documents mixed in?
        
        OUTPUT FORMAT:
        Return ONLY a JSON object with:
        {{
            "reasoning": "Brief explanation...",
            "score": <float between 0.0 and 1.0>
        }}
        1.0 means all retrieved docs are highly relevant. 0.0 means all are irrelevant.
        """
        
        response = await self._call_llm(prompt)
        try:
             # Extract JSON from potential markdown blocks
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                response = response.split("```")[1].split("```")[0].strip()
            
            data = json.loads(response)
            return float(data.get("score", 0.0))
        except Exception:
            return 0.0

    async def evaluate_answer_relevancy(self, question: str, answer: str) -> float:
        """
        Measure if the answer actually addresses the question.
        Score: 0.0 to 1.0
        """
        prompt = f"""
        You are a strict judge.
        
        QUESTION: {question}
        ANSWER: {answer}
        
        TASK:
        Does the ANSWER directly address the QUESTION?
        Ignore correctness for now, just check relevance.
        
        OUTPUT FORMAT:
        Return ONLY a JSON object with:
        {{
            "score": <float between 0.0 and 1.0>
        }}
        """
        
        response = await self._call_llm(prompt)
        try:
             # Extract JSON from potential markdown blocks
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                response = response.split("```")[1].split("```")[0].strip()
            
            data = json.loads(response)
            return float(data.get("score", 0.0))
        except Exception:
            return 0.0

    async def run_batch_evaluation(self, samples: List[Dict[str, Any]]):
        """
        Run evaluation on a batch of samples.
        Each sample dict must have: 'question', 'answer', 'context' (list).
        """
        print(f"🚀 Starting RAG evaluation on {len(samples)} samples...")
        
        results = {
            "faithfulness": [],
            "context_precision": [],
            "answer_relevancy": []
        }
        
        # Process concurrently with semaphore to respect rate limits
        sem = asyncio.Semaphore(3) # Max 3 concurrent requests
        
        async def evaluate_single(sample):
            async with sem:
                q = sample.get("question", "")
                a = sample.get("answer", "")
                c = sample.get("context", [])
                
                # Run metrics in parallel for this sample
                f_score, cp_score, ar_score = await asyncio.gather(
                    self.evaluate_faithfulness(q, c, a),
                    self.evaluate_context_precision(q, c),
                    self.evaluate_answer_relevancy(q, a)
                )
                
                return f_score, cp_score, ar_score

        tasks = [evaluate_single(s) for s in samples]
        scores = await asyncio.gather(*tasks)
        
        for f, cp, ar in scores:
            results["faithfulness"].append(f)
            results["context_precision"].append(cp)
            results["answer_relevancy"].append(ar)
            
        # Calculate averages
        def avg(lst): return sum(lst) / len(lst) if lst else 0.0
        
        final_metrics = {
            "faithfulness_score": round(avg(results["faithfulness"]), 2),
            "context_precision_score": round(avg(results["context_precision"]), 2),
            "answer_relevancy_score": round(avg(results["answer_relevancy"]), 2),
            "hallucination_rate": round(1.0 - avg(results["faithfulness"]), 2), # Inverse of faithfulness
            "samples_count": len(samples)
        }
        
        save_metrics(final_metrics)
        print("✅ Evaluation complete. Metrics saved.")
        return final_metrics

# Global instance
evaluator = RagasEvaluator()
