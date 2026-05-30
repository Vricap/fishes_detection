const backendUrl = "http://localhost:8000"; // change if deployed
// const backendUrl = "https://generators-friendship-cho-muscles.trycloudflare.com"; // change if deployed

const fileInput = document.getElementById("fileInput");
const originalImage = document.getElementById("originalImage");
const resultImage = document.getElementById("resultImage");
const detectionsDiv = document.getElementById("detections");
// const describeBtn = document.getElementById("describeBtn");
const llmResults = document.getElementById("llmResults");
const uploadArea = document.getElementById("uploadArea");
const loadingState = document.getElementById("loadingState");

uploadArea.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  // display loading
  loadingState.style.display = "block";

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

    const totalFish = Object.values(data.count).reduce((a, b) => a + b, 0);

    const speciesCount = Object.keys(data.count).length;

    document.getElementById("statsSection").innerHTML = `
    <div class="stats-grid">

      <div class="stat-card">
          <span>Total Ikan</span>
          <h2>${totalFish}</h2>
      </div>

      <div class="stat-card">
          <span>Spesies</span>
          <h2>${speciesCount}</h2>
      </div>

      <div class="stat-card">
          <span>Terdeteksi AI</span>
          <h2>100%</h2>
      </div>

    </div>
    `;

    // Show result image
    resultImage.src = backendUrl + data.image_url;

    // Show detection details
    if (data.detections.length === 0) {
      detectionsDiv.innerHTML = "<p>No fish detected.</p>";
      return;
    }

    // Show detection details
    let html = `
    <div class="detection-section">

        <div class="section-header">
            <h2>🐟 Hasil Deteksi</h2>
            <span>${Object.values(data.count).reduce((a, b) => a + b, 0)} ikan terdeteksi</span>
        </div>

        <div class="species-grid">
    `;

    Object.entries(data.count).forEach(([species, count]) => {
      html += `

      <div class="species-card">

          <div class="species-icon">
              🐟
          </div>

          <div class="species-content">
              <h3>${species.toUpperCase()}</h3>
              <p>${count} ekor terdeteksi</p>
          </div>

          <div class="species-badge">
              ${count}
          </div>

      </div>

      `;
    });

    html += `
        </div>
      </div>
    `;

    // BEAUTIFUL NUTRIENT UI
    Object.entries(data.nutrition_total).forEach(([species, nut]) => {
      html += `

      <div class="nutrition-card">

          <div class="nutrition-header">
              <div>
                  <h3>${species.toUpperCase()}</h3>
                  <span class="nutrition-subtitle">
                      Nutritional Summary
                  </span>
              </div>
          </div>

          <div class="nutrition-highlight">

              <div class="highlight-card">
                  <span>💪 Protein</span>
                  <strong>${nut.protein} g</strong>
              </div>

              <div class="highlight-card">
                  <span>🥩 Lemak</span>
                  <strong>${nut.lemak} g</strong>
              </div>

              <div class="highlight-card">
                  <span>🔥 Kalori</span>
                  <strong>${nut.kalori} kcal</strong>
              </div>

          </div>

          <div class="nutrition-details">

              <div class="metric">
                  <span>💧 Air</span>
                  <strong>${nut.air} g</strong>
              </div>

              <div class="metric">
                  <span>🌾 Karbohidrat</span>
                  <strong>${nut.karbo} g</strong>
              </div>

              <div class="metric">
                  <span>🧪 Nitrogen</span>
                  <strong>${nut.nitrogen} g</strong>
              </div>

              <div class="metric">
                  <span>🦴 Kalsium</span>
                  <strong>${nut.kalsium} mg</strong>
              </div>

              <div class="metric">
                  <span>🌿 Serat</span>
                  <strong>${nut.serat} g</strong>
              </div>

              <div class="metric">
                  <span>⚪ Abu</span>
                  <strong>${nut.abu} g</strong>
              </div>

              <div class="metric">
                  <span>⚡ Fosfor</span>
                  <strong>${nut.fosfor} mg</strong>
              </div>

              <div class="metric">
                  <span>🩸 Besi</span>
                  <strong>${nut.besi} mg</strong>
              </div>

              <div class="metric">
                  <span>🧂 Natrium</span>
                  <strong>${nut.natrium} mg</strong>
              </div>

              <div class="metric">
                  <span>⚡ Kalium</span>
                  <strong>${nut.kalium} mg</strong>
              </div>

          </div>

      </div>

      `;
    });

    html += `
        </div>
      </div>
    `;

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

  let html = `
  <div class="recipe-section">

      <div class="section-header">
          <h2>🍽 AI Cooking Assistant</h2>
          <span>Generated by AI</span>
      </div>

      <div class="recipe-grid">
  `;

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
    let html = `
    <div class="recipe-section">

        <div class="section-header">
            <h2>🍽 AI Cooking Assistant</h2>
            <span>Generated by AI</span>
        </div>

        <div class="recipe-grid">
    `;

    // Species cards
    if (Array.isArray(llm.species)) {
      html += `<div class="nutrient-grid" style="margin-top:12px;">`;
      llm.species.forEach((s) => {
        const methods = (s.recommended_cooking_methods || [])
          .map((m) => {
            if (typeof m === "string") {
              return `<li>${m}</li>`;
            }

            return `
              <li>
                <strong>${m.method}</strong>
                ${m.note ? `<br><span>${m.note}</span>` : ""}
              </li>
            `;
          })
          .join("");

        html += `

        <div class="recipe-card">

            <div class="recipe-top">

                <div>
                    <h3>${s.species.toUpperCase()}</h3>
                    <p>
                      ${s.count || 0} ikan terdeteksi
                    </p>
                </div>

            </div>

            <div class="recipe-description">

                ${s.description || ""}

            </div>

            <div class="recipe-block">

                <h4>🔥 Cara Memasak yang Direkomendasikan</h4>

                <ul>
                  ${methods}
                </ul>

            </div>

            <div class="recipe-block">

                <h4>👨‍🍳 Resep Simpel</h4>

                <p>
                  ${s.simple_recipe || "-"}
                </p>

            </div>

            <div class="recipe-block">

                <h4>🍋 Penyajian</h4>

                <p>
                  ${s.serving_recommendations || "-"}
                </p>

            </div>

        </div>

        `;
      });
      html += `
          </div>
      </div>
      `;
    }

    llmResults.innerHTML = html;
    loadingState.style.display = "none";
  } catch (err) {
    console.error(err);
    llmResults.innerHTML = "<p>Error connecting to server or OpenAI.</p>";
  }
}
