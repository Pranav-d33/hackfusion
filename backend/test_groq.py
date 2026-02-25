import config
import requests

key = config.GROQ_API_KEY
url = config.GROQ_BASE_URL + "/models"
res = requests.get(url, headers={"Authorization": f"Bearer {key}"})
print("Groq status:", res.status_code)
if res.status_code != 200:
    print(res.text)

print(config.NLU_FALLBACK_MODELS)
