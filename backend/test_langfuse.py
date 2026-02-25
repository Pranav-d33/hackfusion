import asyncio
from agents.ordering_agent import _call_llm
from observability.langfuse_client import init_langfuse

async def main():
    init_langfuse()
    messages = [{"role": "user", "content": "I want some Paracetamol"}]
    res = await _call_llm(messages)
    print("Result:", res)

asyncio.run(main())
