const backendUrl = "http://localhost:8000"; // change if deployed
// const backendUrl = "https://generators-friendship-cho-muscles.trycloudflare.com"; // change if deployed

const fileInput = document.getElementById("fileInput");
const originalImage = document.getElementById("originalImage");
const resultImage = document.getElementById("resultImage");
const detectionsDiv = document.getElementById("detections");
// const describeBtn = document.getElementById("describeBtn");
const llmResults = document.getElementById("llmResults");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  // Display original preview
  originalImage.src = URL.createObjectURL(file);

  const formData = new FormData();
  formData.append("file", file);

  detectionsDiv.innerHTML = "<p>Processing...</p>";

  try {
    // Send to backend
    const response = await fetch(`${backendUrl}/detect`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    // Show result image
    resultImage.src = backendUrl + data.image_url;

    // Show detection details
    if (data.detections.length === 0) {
      detectionsDiv.innerHTML = "<p>No fish detected.</p>";
      return;
    }

    // Show detection details
    let html = "<h3>Hasil Deteksi:</h3>";

    html += "<p><strong>Total ikan terdeteksi:</strong></p><ul>";
    Object.entries(data.count).forEach(([species, count]) => {
      html += `<li>${species} — ${count} ikan</li>`;
    });
    html += "</ul>";

    // BEAUTIFUL NUTRIENT UI
    html += `
      <div class="nutrient-section">
        <div class="nutrient-title">Kandungan gizi (Total)</div>
        <div class="nutrient-grid">
    `;

    Object.entries(data.nutrition_total).forEach(([species, nut]) => {
      html += `
        <div class="nutrient-card">
          <h4>${species.toUpperCase()}</h4>

          <div class="nutrient-item">
            <div class="nutrient-icon icon-protein">P</div>
            Protein: <strong>${nut.protein} g</strong>
          </div>

          <div class="nutrient-item">
            <div class="nutrient-icon icon-fat">F</div>
            Lemak: <strong>${nut.lemak} g</strong>
          </div>

          <div class="nutrient-item">
            <div class="nutrient-icon icon-cal">C</div>
            Kalori: <strong>${nut.kalori} kcal</strong>
          </div>

          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">w</div>
          Air: <strong>${nut.air} g</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">n</div>
          nitrogen: <strong>${nut.nitrogen} g</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">k</div>
          karbo: <strong>${nut.karbo} g</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">ca</div>
          kalsium: <strong>${nut.kalsium} mg</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">f</div>
          serat: <strong>${nut.serat} g</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">a</div>
          abu: <strong>${nut.abu} g</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">p</div>
          fosfor: <strong>${nut.fosfor} mg</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">fe</div>
          besi: <strong>${nut.besi} mg</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">na</div>
          natrium: <strong>${nut.natrium} mg</strong>
          </div>
          <div class="nutrient-item">
          <div class="nutrient-icon icon-nut">k</div>
          kalium: <strong>${nut.kalium} mg</strong>
          </div>

        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    // html += "<h3>Deteksi mentah yolo:</h3><ul>";
    // data.detections.forEach((det) => {
    //   html += `
    //     <li>
    //       ${det.class} — ${(det.confidence * 100).toFixed(1)}%
    //     </li>
    //   `;
    // });
    // html += "</ul>";

    detectionsDiv.innerHTML = html;
    window.lastDetectionData = data; // allow describe button to use latest result
    // describeBtn.click();
    await getGpt();
  } catch (error) {
    console.error(error);
    detectionsDiv.innerHTML = "<p>Error connecting to backend.</p>";
  }
});

async function getGpt() {
  // Use the last detection result stored in `lastDetectionData` (we'll save it)
  if (!window.lastDetectionData) {
    llmResults.innerHTML = "<p>Please run detection first.</p>";
    return;
  }

  llmResults.innerHTML = "<p>Men-generate deskripsi & rekomendasi...</p>";

  try {
    const res = await fetch(`${backendUrl}/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        count: window.lastDetectionData.count,
        nutrition_total: window.lastDetectionData.nutrition_total,
      }),
    });

    const json = await res.json();

    if (!json.ok) {
      llmResults.innerHTML = "<p>Error from server.</p>";
      return;
    }

    const llm = json.llm;

    // If error returned in llm parsing:
    if (llm.error) {
      llmResults.innerHTML = `<pre>${llm.raw || llm.error}</pre>`;
      return;
    }

    // Build HTML from structured LLM output
    let html = `<h3>Rekomendasi Masakan</h3>`;

    // Summary
    // if (llm.summary) {
    //   html += `<div class="nutrient-card"><strong>Total ikan:</strong> ${llm.summary.total_fish_count}<br/>
    //            <strong>Combined nutrition:</strong> Protein ${llm.summary.combined_nutrition.protein}g —
    //            Fat ${llm.summary.combined_nutrition.fat}g —
    //            Calories ${llm.summary.combined_nutrition.calories} kcal<br/>
    //            <em>${llm.summary.quick_meal_plan}</em></div>`;
    // }

    // Species cards
    if (Array.isArray(llm.species)) {
      html += `<div class="nutrient-grid" style="margin-top:12px;">`;
      llm.species.forEach((s) => {
        html += `
          <div class="nutrient-card">
            <h4>${s.species.toUpperCase()} — ${s.count ? s.count + " ikan" : ""}</h4>
            <p style="font-size:14px;margin-bottom:10px;">${s.description}</p>

            <div style="margin-bottom:8px;">
              <strong>Cara Memasak</strong>
              <ul>
                ${(s.recommended_cooking_methods || []).map((m) => `<li><strong>${m.method}</strong> — ${m.note || m}</li>`).join("")}
              </ul>
            </div>

            <div style="margin-bottom:8px;">
              <strong>Resep simpel (per ikan)</strong>
              <p style="font-size:14px;">${s.simple_recipe}</p>
            </div>

            <div>
              <strong>Penyajian</strong>
              <p style="font-size:14px;">${s.serving_recommendations}</p>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    llmResults.innerHTML = html;
  } catch (err) {
    console.error(err);
    llmResults.innerHTML = "<p>Error connecting to server or OpenAI.</p>";
  }
}
