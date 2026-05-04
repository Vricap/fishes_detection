import io
import os
import uuid

from dotenv import load_dotenv
from fastapi import Body, FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from openai import OpenAI
from PIL import Image
from ultralytics import YOLO

NUTRITION_FACTS = {
    "lele": {
        "protein": 16.5,
        "lemak": 7.31,
        "kalori": 129,
        "air": 75.9,
        "nitrogen": 2.64,
        "karbo": 0,
        "kalsium": 8,
        "serat": 0,
        "abu": 0.97,
        "fosfor": 166,
        "besi": 0.25,
        "natrium": 61,
        "kalium": 292,
    },
    "nila": {
        "protein": 19,
        "lemak": 2.48,
        "kalori": 95,
        "air": 78.3,
        "nitrogen": 3.04,
        "karbo": 0,
        "kalsium": 9,
        "serat": 0,
        "abu": 1.15,
        "fosfor": 159,
        "besi": 0.25,
        "natrium": 94,
        "kalium": 342,
    },
    "gurame": {
        "protein": 17.48,
        "lemak": 5.49,
        "kalori": 125,
        "air": 75,
        "nitrogen": 2.5,
        "karbo": 0,
        "kalsium": 8,
        "serat": 0,
        "abu": 1.10,
        "fosfor": 111,
        "besi": 0.25,
        "natrium": 48,
        "kalium": 326,
    },
    "patin": {
        "protein": 16.5,
        "lemak": 7.31,
        "kalori": 129,
        "air": 75.9,
        "nitrogen": 2.64,
        "karbo": 0,
        "kalsium": 8,
        "serat": 0,
        "abu": 0.97,
        "fosfor": 166,
        "besi": 0.25,
        "natrium": 61,
        "kalium": 292,
    },
    "bandeng": {
        "protein": 20,
        "lemak": 4.8,
        "kalori": 123,
        "air": 74,
        "nitrogen": 2.2,
        "karbo": 0,
        "kalsium": 20,
        "serat": 0,
        "abu": 1.2,
        "fosfor": 150,
        "besi": 2.0,
        "natrium": 67,
        "kalium": 271.1,
    },
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
                total_nutrition[cls_name] = {
                    "protein": 0,
                    "lemak": 0,
                    "kalori": 0,
                    "air": 0,
                    "nitrogen": 0,
                    "karbo": 0,
                    "kalsium": 0,
                    "serat": 0,
                    "abu": 0,
                    "fosfor": 0,
                    "besi": 0,
                    "natrium": 0,
                    "kalium": 0,
                }

            total_nutrition[cls_name]["protein"] += NUTRITION_FACTS[cls_name]["protein"]
            total_nutrition[cls_name]["lemak"] += NUTRITION_FACTS[cls_name]["lemak"]
            total_nutrition[cls_name]["kalori"] += NUTRITION_FACTS[cls_name]["kalori"]
            total_nutrition[cls_name]["air"] += NUTRITION_FACTS[cls_name]["air"]
            total_nutrition[cls_name]["nitrogen"] += NUTRITION_FACTS[cls_name][
                "nitrogen"
            ]
            total_nutrition[cls_name]["karbo"] += NUTRITION_FACTS[cls_name]["karbo"]
            total_nutrition[cls_name]["kalsium"] += NUTRITION_FACTS[cls_name]["kalsium"]
            total_nutrition[cls_name]["serat"] += NUTRITION_FACTS[cls_name]["serat"]
            total_nutrition[cls_name]["abu"] += NUTRITION_FACTS[cls_name]["abu"]
            total_nutrition[cls_name]["fosfor"] += NUTRITION_FACTS[cls_name]["fosfor"]
            total_nutrition[cls_name]["besi"] += NUTRITION_FACTS[cls_name]["besi"]
            total_nutrition[cls_name]["natrium"] += NUTRITION_FACTS[cls_name]["natrium"]
            total_nutrition[cls_name]["kalium"] += NUTRITION_FACTS[cls_name]["kalium"]

    print(detections)
    print(fish_count)
    print(total_nutrition)
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
