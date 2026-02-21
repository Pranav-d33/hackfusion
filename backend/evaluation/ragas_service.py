
import os
import json
import asyncio
import httpx
import time
from typing import List, Dict, Any, Optional

# Import config which loads .env
from config import GROQ_API_KEY, GROQ_PRIMARY_MODEL, GROQ_FALLBACK_MODEL
from evaluation.store import save_metrics

# ── Use Groq for evaluation (fast, generous free tier, already configured) ──
EVAL_MODEL = GROQ_FALLBACK_MODEL or "llama-3.1-8b-instant"  # 8B is fast + cheap for eval
FALLBACK_MODEL = "llama-3.1-8b-instant"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

class RagasEvaluator:
    """
    Lightweight RAG evaluator that mimics RAGAS metrics using direct LLM calls.
    Uses Groq API for fast, reliable evaluation (same provider as main agent).
    """
    
    def __init__(self):
        if not GROQ_API_KEY:
            print("⚠️ GROQ_API_KEY not found. Evaluation will fail.")
            
    async def _call_llm(self, prompt: str, model: str = None, retries: int = 2) -> str:
        """Call Groq LLM with retries."""
        model = model or EVAL_MODEL
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "max_tokens": 500,
        }
        
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(GROQ_URL, headers=headers, json=payload)
                    response.raise_for_status()
                    data = response.json()
                    content = data["choices"][0]["message"]["content"]
                    return content.strip()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    wait_time = (attempt + 1) * 2  # 2s, 4s, 6s
                    print(f"⚠️ Groq rate limited (attempt {attempt+1}/{retries+1}), waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    print(f"⚠️ Groq eval call failed (attempt {attempt+1}/{retries+1}): {e}")
                    if attempt == retries:
                        if model != FALLBACK_MODEL:
                            print(f"🔄 Switching to fallback model: {FALLBACK_MODEL}")
                            return await self._call_llm(prompt, model=FALLBACK_MODEL, retries=0)
                        return ""
                    await asyncio.sleep(1 + attempt)
            except Exception as e:
                print(f"⚠️ Groq eval call failed (attempt {attempt+1}/{retries+1}): {e}")
                if attempt == retries:
                    if model != FALLBACK_MODEL:
                        print(f"🔄 Switching to fallback model: {FALLBACK_MODEL}")
                        return await self._call_llm(prompt, model=FALLBACK_MODEL, retries=0)
                    return ""
                await asyncio.sleep(1 + attempt)
        
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
        start_time = time.time()
        print(f"🚀 Starting RAG evaluation on {len(samples)} samples...")
        
        results = {
            "faithfulness": [],
            "context_precision": [],
            "answer_relevancy": []
        }
        
        # Process concurrently with semaphore to respect rate limits
        # Reduced to 2 concurrent requests to avoid 429 errors on free tier
        sem = asyncio.Semaphore(2)
        completed = 0  # Track progress
        
        async def evaluate_single(sample, idx):
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
                
                nonlocal completed
                completed += 1
                print(f"✓ Sample {completed}/{len(samples)} complete")
                
                return f_score, cp_score, ar_score

        tasks = [evaluate_single(s, i) for i, s in enumerate(samples)]
        scores = await asyncio.gather(*tasks)
        
        for f, cp, ar in scores:
            results["faithfulness"].append(f)
            results["context_precision"].append(cp)
            results["answer_relevancy"].append(ar)
            
        # Calculate averages
        def avg(lst): return sum(lst) / len(lst) if lst else 0.0
        
        elapsed = time.time() - start_time
        
        final_metrics = {
            "faithfulness_score": round(avg(results["faithfulness"]), 2),
            "context_precision_score": round(avg(results["context_precision"]), 2),
            "answer_relevancy_score": round(avg(results["answer_relevancy"]), 2),
            "hallucination_rate": round(1.0 - avg(results["faithfulness"]), 2), # Inverse of faithfulness
            "samples_count": len(samples),
            "evaluation_time_seconds": round(elapsed, 1)
        }
        
        save_metrics(final_metrics)
        print(f"✅ Evaluation complete in {round(elapsed, 1)}s ({round(elapsed/len(samples), 1)}s per sample). Metrics saved.")
        return final_metrics

# Global instance
evaluator = RagasEvaluator()
