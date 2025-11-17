from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import uuid
import os
from PIL import Image
import io
from openai import OpenAI
from fastapi import Body
from dotenv import load_dotenv

NUTRITION_FACTS = {
    "lele": {"protein": 18, "fat": 12, "calories": 105},
    "nila": {"protein": 20, "fat": 3, "calories": 96},
    "gurame": {"protein": 19, "fat": 5, "calories": 102},
    "patin": {"protein": 15, "fat": 5, "calories": 120},
    "bandeng": {"protein": 20, "fat": 4, "calories": 129},
}

app = FastAPI()
load_dotenv()

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model once
model = YOLO("models/best.pt")

RESULTS_DIR = "static/results"
os.makedirs(RESULTS_DIR, exist_ok=True)


# Configure from env
# OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# if not OPENAI_API_KEY:
#     raise RuntimeError("Set OPENAI_API_KEY environment variable")
# openai.api_key = OPENAI_API_KEY

client = OpenAI(
    # This is the default and can be omitted
    # api_key=os.environ.get("OPENAI_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY"),
)


# Helper: prompt builder
def build_prompt(summary):
    # summary: dict with keys: count (dict), nutrition_total (dict)
    # Return a clear prompt asking for structured JSON
    prompt = f"""
You are a helpful culinary & fish expert. Given the detection results below, produce a JSON object which contains, for each species:
- species (string)
- description (2-4 sentences, short natural history + taste/texture)
- recommended_cooking_methods (list of 2-4 short method names with 1-line explanation each)
- simple_recipe (one short recipe for that species scaled to 1 fish)
- serving_recommendations (how to serve and suggested side dishes)
Also provide a top-level "summary" with:
- total_fish_count (int),
- combined_nutrition (object: protein, fat, calories),
- quick_meal_plan (1-2 sentences suggesting how to use all detected fish together).
Return only valid JSON.

DETECTION_SUMMARY:
{summary}

Output JSON schema example:
{{
  "species": [
    {{
      "species": "nila",
      "count": 3,
      "description": "...",
      "recommended_cooking_methods": [
         {{ "method": "grill", "note": "..." }},
         ...
      ],
      "simple_recipe": "...",
      "serving_recommendations": "..."
    }},
    ...
  ],
  "summary": {{
    "total_fish_count": 4,
    "combined_nutrition": {{ "protein": 78, "fat": 21, "calories": 393 }},
    "quick_meal_plan": "..."
  }}
}}

Be concise and friendly. And use Bahasa Indonesia language in the response.
"""
    return prompt


@app.post("/describe")
async def describe_detection(payload: dict = Body(...)):
    """
    Expects payload containing "count" and "nutrition_total" (same format returned by /detect).
    Example:
    {
      "count": {"nila": 3, "lele":1},
      "nutrition_total": {"nila":{"protein":60,"fat":9,"calories":288}, "lele": {...}}
    }
    """
    summary = {
        "count": payload.get("count", {}),
        "nutrition_total": payload.get("nutrition_total", {}),
    }

    prompt = build_prompt(summary)

    # response = client.responses.create(
    #     model="gpt-4o",
    #     instructions="You are a helpful culinary & fish expert.",
    #     input=prompt,
    # )

    completion = client.chat.completions.create(
        model="openai/gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )

    # Extract text
    # text = response.output_text
    text = completion.choices[0].message.content

    # Try to parse returned JSON robustly
    import json

    try:
        result_json = json.loads(text)
    except Exception:
        # If model returned conversation with extra text, try to extract JSON substring
        import re

        m = re.search(r"(\{.*\})", text, re.S)
        if m:
            try:
                result_json = json.loads(m.group(1))
            except Exception:
                result_json = {"error": "Could not parse model output", "raw": text}
        else:
            result_json = {"error": "No JSON found", "raw": text}

    return {"ok": True, "llm": result_json}


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    contents = await file.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")

    results = model(img)

    file_id = str(uuid.uuid4()) + ".jpg"
    output_path = os.path.join(RESULTS_DIR, file_id)
    results[0].plot(save=True, filename=output_path)

    detections = []
    fish_count = {}  # count fish per species
    total_nutrition = {}  # nutrition total per species

    for box in results[0].boxes:
        cls_name = model.names[int(box.cls)]
        conf = float(box.conf)

        detections.append(
            {
                "class": cls_name,
                "confidence": conf,
            }
        )

        # Count fish
        if cls_name not in fish_count:
            fish_count[cls_name] = 0
        fish_count[cls_name] += 1

        # Calculate nutrition
        if cls_name in NUTRITION_FACTS:
            if cls_name not in total_nutrition:
                total_nutrition[cls_name] = {"protein": 0, "fat": 0, "calories": 0}

            total_nutrition[cls_name]["protein"] += NUTRITION_FACTS[cls_name]["protein"]
            total_nutrition[cls_name]["fat"] += NUTRITION_FACTS[cls_name]["fat"]
            total_nutrition[cls_name]["calories"] += NUTRITION_FACTS[cls_name][
                "calories"
            ]

    return {
        "image_url": f"/result/{file_id}",
        "detections": detections,
        "count": fish_count,
        "nutrition_total": total_nutrition,
    }


@app.get("/result/{filename}")
async def get_result(filename: str):
    filepath = os.path.join(RESULTS_DIR, filename)
    return FileResponse(filepath)
