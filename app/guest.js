import {
  doc,
  runTransaction,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

export async function initGuestMode(djId) {
  // Elements
  const guestContent = document.getElementById("guestContent");
  const guestLoading = document.getElementById("guestLoading");
  const searchInput = document.getElementById("searchInput");
  const suggestions = document.getElementById("suggestions");
  const form = document.getElementById("requestForm");
  const submitBtn = document.getElementById("submitButton");
  const confirmation = document.getElementById("confirmation");
  const warning = document.getElementById("warning");
  const card = document.getElementById("selectedSongCard");
  const cardArtwork = document.getElementById("cardArtwork");
  const cardTitle = document.getElementById("cardTitle");
  const cardArtist = document.getElementById("cardArtist");
  const socialModal = document.getElementById("socialModal");
  const socialCloseBtn = document.getElementById("socialCloseBtn");

  // Sections
  const djNameHeader = document.getElementById("djNameHeader");
  const djNameDisplay = document.getElementById("djNameDisplay");
  const tipSection = document.getElementById("tipSection");
  const socialSection = document.getElementById("socialSection");
  const aboutSection = document.getElementById("aboutSection");
  const socialDivider = document.getElementById("socialDivider");

  // Social Map
  const btns = {
    instagram: document.getElementById("guestIgBtn"),
    tiktok: document.getElementById("guestTikTokBtn"),
    youtube: document.getElementById("guestYtBtn"),
    soundcloud: document.getElementById("guestScBtn"),
    mixcloud: document.getElementById("guestMcBtn"),
    patreon: document.getElementById("guestPatreonBtn"),
    bandcamp: document.getElementById("guestBcBtn"),
    website: document.getElementById("guestWebBtn"),
  };

  // Setup UI
  if (guestLoading) guestLoading.hidden = true;
  if (guestContent) guestContent.hidden = false;

  if (socialCloseBtn) {
    socialCloseBtn.addEventListener("click", () => {
      socialModal.classList.add("hidden");
      socialModal.setAttribute("aria-hidden", "true");
    });
  }

  // === LOAD DJ PROFILE ===
  try {
    const userSnap = await getDoc(doc(db, "users", djId));
    if (userSnap.exists()) {
      const d = userSnap.data();

      // DJ Name
      if (d.djName) {
        djNameDisplay.textContent = d.djName;
        djNameHeader.hidden = false;
      }

      // About
      if (d.aboutText) {
        document.getElementById("aboutTextDisplay").textContent = d.aboutText;
        aboutSection.hidden = false;
      }

      // Socials
      let hasSocials = false;
      const setLink = (type, url) => {
        if (btns[type] && url) {
          btns[type].href = url;
          btns[type].hidden = false;
          hasSocials = true;
        }
      };
      if (d.instagram)
        setLink("instagram", `https://instagram.com/${d.instagram}`);
      if (d.tiktok)
        setLink("tiktok", `https://tiktok.com/@${d.tiktok.replace("@", "")}`);
      if (d.youtube)
        setLink(
          "youtube",
          `https://youtube.com/@${d.youtube.replace("@", "")}`,
        );
      if (d.soundcloud)
        setLink("soundcloud", `https://soundcloud.com/${d.soundcloud}`);
      if (d.mixcloud) setLink("mixcloud", `https://mixcloud.com/${d.mixcloud}`);
      if (d.patreon) setLink("patreon", `https://patreon.com/${d.patreon}`);
      if (d.bandcamp) setLink("bandcamp", d.bandcamp);
      if (d.website) setLink("website", d.website);

      if (hasSocials) {
        socialSection.hidden = false;
        socialDivider.hidden = false;
        // Clone socials for modal
        const modalLinks = document.getElementById("modalSocialLinks");
        if (modalLinks)
          modalLinks.innerHTML =
            socialSection.querySelector(".social-links").innerHTML;
      }

      // Tips
      if (d.applePayLink || d.googlePayLink || d.paypalLink) {
        tipSection.hidden = false;
        const tipHeader = document.getElementById("tipHeader");
        const tipDesc = document.getElementById("tipDesc");

        if (tipHeader)
          tipHeader.textContent = d.tipHeader || "Buy the DJ a drink";
        if (tipDesc) {
          if (d.tipDesc) tipDesc.textContent = d.tipDesc;
          else tipDesc.hidden = true;
        }

        if (d.applePayLink) {
          document.getElementById("applePayBtn").href = d.applePayLink;
          document.getElementById("applePayBtn").hidden = false;
        }
        if (d.googlePayLink) {
          document.getElementById("googlePayBtn").href = d.googlePayLink;
          document.getElementById("googlePayBtn").hidden = false;
        }
        if (d.paypalLink) {
          document.getElementById("paypalBtn").href = d.paypalLink;
          document.getElementById("paypalBtn").hidden = false;
        }
      }
    } else {
      warning.textContent = "DJ not found. Please check the URL.";
      warning.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Profile load error", err);
    warning.textContent = "Error loading DJ profile. Please check your connection.";
    warning.classList.remove("hidden");
  }

  // Search Logic
  let debounceTimer;
  let currentAbortController = null;
  
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      
      // Abort any pending fetch immediately when the user types
      if (currentAbortController) {
        currentAbortController.abort();
      }
      
      debounceTimer = setTimeout(async () => {
        const q = searchInput.value.trim();
        if (q.length < 2) {
          suggestions.innerHTML = "";
          return;
        }
        
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;
        
        try {
          const res = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=5`,
            { signal }
          );
          const { results = [] } = await res.json();
          suggestions.innerHTML = "";
          results.forEach((t) => {
            const li = document.createElement("li");
            li.className = "suggestion-item";
            li.innerHTML = `<img src="${t.artworkUrl60}" class="suggestion-thumb"><div><div class="track-title">${t.trackName}</div><div class="track-artist">${t.artistName}</div></div>`;
            li.onclick = () => {
              form.artist.value = t.artistName;
              form.title.value = t.trackName;
              form.appleMusicUrl.value = t.trackViewUrl || "";
              form.artworkUrl.value = t.artworkUrl100 || t.artworkUrl60;
              form.genre.value = t.primaryGenreName || "";
              form.releaseYear.value = t.releaseDate
                ? new Date(t.releaseDate).getFullYear()
                : "";

              document.getElementById("cardArtwork").src = t.artworkUrl100;
              document.getElementById("cardTitle").textContent = t.trackName;
              document.getElementById("cardArtist").textContent = t.artistName;
              document
                .getElementById("selectedSongCard")
                .classList.remove("hidden");
              submitBtn.disabled = false;
              suggestions.innerHTML = "";
            };
            suggestions.appendChild(li);
          });
        } catch (e) {
          if (e.name === 'AbortError') {
            console.log('Fetch aborted');
          } else {
            console.error('iTunes fetch error:', e);
          }
        }
      }, 300);
    });
  }

  // --- Local Rate Limiting ---
  function getDeviceId() {
    let deviceId = localStorage.getItem("deviceId");
    if (!deviceId) {
      deviceId =
        "device-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("deviceId", deviceId);
    }
    return deviceId;
  }

  function getRequestData() {
    try {
      return (
        JSON.parse(
          localStorage.getItem(`requests_data_${getDeviceId()}_${djId}`),
        ) || { timestamps: [], songKeys: [] }
      );
    } catch {
      return { timestamps: [], songKeys: [] };
    }
  }

  function isRateLimited() {
    const data = getRequestData();
    const fifteenMinsAgo = Date.now() - 900000;
    const recent = data.timestamps.filter((ts) => ts > fifteenMinsAgo);
    data.timestamps = recent;
    localStorage.setItem(
      `requests_data_${getDeviceId()}_${djId}`,
      JSON.stringify(data),
    );
    return recent.length >= 3;
  }

  // Submit Logic
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (isRateLimited()) {
        warning.textContent =
          "You've reached the request limit. Please try again in 15 minutes.";
        warning.classList.remove("hidden");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";

      const today = new Date().toISOString().slice(0, 10);
      const songKey =
        `${form.artist.value.toLowerCase()}||${form.title.value.toLowerCase()}||${today}`.replace(
          /\//g,
          "-",
        );

      // Step 1 Routing: Write directly to the DJ's sub-collection
      const ref = doc(db, "users", djId, "requests", songKey);

      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists()) {
            tx.update(ref, {
              count: snap.data().count + 1,
              lastRequested: serverTimestamp(),
            });
          } else {
            tx.set(ref, {
              artist: form.artist.value,
              title: form.title.value,
              appleMusicUrl: form.appleMusicUrl.value,
              artworkUrl: form.artworkUrl.value,
              genre: form.genre.value,
              releaseYear: form.releaseYear.value,
              timestamp: Date.now(),
              lastRequested: serverTimestamp(),
              fulfilled: false,
              count: 1,
            });
          }
        });

        // Save Local Data
        const data = getRequestData();
        data.timestamps.push(Date.now());
        data.songKeys.push(songKey);
        localStorage.setItem(
          `requests_data_${getDeviceId()}_${djId}`,
          JSON.stringify(data),
        );

        // Trigger Social Modal
        let socialCount = parseInt(
          sessionStorage.getItem(`socialCount_${djId}`) || "0",
          10,
        );
        socialCount++;
        sessionStorage.setItem(`socialCount_${djId}`, String(socialCount));
        if (socialCount >= 3) {
          if (socialModal) {
            socialModal.classList.remove("hidden");
            socialModal.setAttribute("aria-hidden", "false");
          }
          sessionStorage.setItem(`socialCount_${djId}`, "0");
        }

        confirmation.classList.remove("hidden");
        warning.classList.add("hidden");
        document.getElementById("selectedSongCard").classList.add("hidden");
        form.reset();
        submitBtn.textContent = "Sent!";
        setTimeout(() => {
          submitBtn.textContent = "Submit Request";
          submitBtn.disabled = true;
          confirmation.classList.add("hidden");
        }, 3000);
      } catch (err) {
        console.error("Transaction Error:", err);
        warning.textContent = "Error sending request. Please check your connection or try again later.";
        warning.classList.remove("hidden");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Request";
      }
    });
  }
}
