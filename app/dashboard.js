import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  setDoc,
  writeBatch,
  query,
  getDocs,
  getDoc,
  serverTimestamp as fbServerTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth, db } from "./firebase-config.js";
import {
  customAlert,
  customConfirm,
  escapeHtml,
  msToTimeAgo,
} from "./utils.js";

const GIG_CUTOFF_HOUR = 6;
const GIG_TIMEZONE = "Europe/London";

function normalizeGigDate(utcMs) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GIG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(utcMs))
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const baseUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  );
  const d = new Date(baseUTC);
  if (Number(parts.hour) < GIG_CUTOFF_HOUR) d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function initDashboardMode() {
  const viewTitle = document.getElementById("viewTitle");
  const feed = document.getElementById("feed");
  const settingsView = document.getElementById("settingsView");
  const shareView = document.getElementById("shareView");
  const controlsBar = document.getElementById("controlsBar");
  const bottomControls = document.getElementById("bottomControls");
  const navDrawer = document.getElementById("navDrawer");

  let currentView = "home";
  let selectedDate = null;
  const requestsMap = {};
  let dateGroups = {};
  let unsubscribeRequests = null;
  let metricsCache = {};

  let activeStatus = "unplayed";
  let activeSort = "lastRequested";
  let activeDecade = "all";
  let activeGenre = "all";

  // --- Auth State & Onboarding ---
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      document.getElementById("authContainer").hidden = false;
      document.getElementById("authContainer").style.display = "flex";
      document.getElementById("app").hidden = true;
      return;
    }
    document.getElementById("authContainer").hidden = true;
    document.getElementById("authContainer").style.display = "none";
    document.getElementById("app").hidden = false;
    document.getElementById("userBadge").textContent = user.email;

    // Load Settings
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const d = snap.data();
        if (document.getElementById("usernameInput"))
          document.getElementById("usernameInput").value = d.username || "";
        if (document.getElementById("djNameInput"))
          document.getElementById("djNameInput").value = d.djName || "";
          
        const photoPreview = document.getElementById("photoPreview");
        if (photoPreview) {
          if (d.photoURL) {
            photoPreview.src = d.photoURL;
            photoPreview.style.display = "block";
          } else {
            photoPreview.style.display = "none";
          }
        }
        if (document.getElementById("aboutTextInput"))
          document.getElementById("aboutTextInput").value = d.aboutText || "";
        [
          "instagram",
          "tiktok",
          "youtube",
          "soundcloud",
          "mixcloud",
          "patreon",
          "bandcamp",
          "website",
        ].forEach((k) => {
          if (document.getElementById(k + "Input"))
            document.getElementById(k + "Input").value = d[k] || "";
        });
        if (document.getElementById("tipHeaderInput"))
          document.getElementById("tipHeaderInput").value = d.tipHeader || "";
        if (document.getElementById("tipDescInput"))
          document.getElementById("tipDescInput").value = d.tipDesc || "";
        ["applePay", "googlePay", "paypal"].forEach((k) => {
          if (document.getElementById(k + "Input"))
            document.getElementById(k + "Input").value = d[k + "Link"] || "";
        });
      }
    } catch (e) {}

    subscribeRequests(user.uid);
  });

  // --- Metrics Definitions ---
  const METRIC_VIEWS = {
    "metrics-songs": {
      title: "Top Songs",
      getData: (lim) => {
        if (metricsCache["metrics-songs"]) return metricsCache["metrics-songs"];
        try {
          const map = {};
          Object.values(requestsMap).forEach((r) => {
            const k = r.title + "||" + r.artist;
            if (!map[k])
              map[k] = {
                label: r.title,
                sublabel: r.artist,
                count: 0,
                artworkUrl: r.artworkUrl,
              };
            map[k].count += r.count || 1;
          });
          const items = Object.values(map)
            .sort((a, b) => b.count - a.count)
            .slice(0, lim);
          metricsCache["metrics-songs"] = { items };
          return metricsCache["metrics-songs"];
        } catch (e) {
          console.error("Error calculating top songs:", e);
          return { items: [] };
        }
      },
    },
    "metrics-artists": {
      title: "Top Artists",
      getData: (lim) => {
        if (metricsCache["metrics-artists"]) return metricsCache["metrics-artists"];
        try {
          const map = {};
          Object.values(requestsMap).forEach((r) => {
            const k = r.artist;
            if (!k) return;
            if (!map[k]) map[k] = { label: k, count: 0 };
            map[k].count += r.count || 1;
          });
          const items = Object.values(map)
            .sort((a, b) => b.count - a.count)
            .slice(0, lim);
          metricsCache["metrics-artists"] = { items };
          return metricsCache["metrics-artists"];
        } catch (e) {
          console.error("Error calculating top artists:", e);
          return { items: [] };
        }
      },
    },
    "metrics-genres": {
      title: "Top Genres",
      getData: (lim) => {
        if (metricsCache["metrics-genres"]) return metricsCache["metrics-genres"];
        try {
          const map = {};
          Object.values(requestsMap).forEach((r) => {
            const k = r.genre;
            if (!k) return;
            if (!map[k]) map[k] = { label: k, count: 0 };
            map[k].count += r.count || 1;
          });
          const items = Object.values(map)
            .sort((a, b) => b.count - a.count)
            .slice(0, lim);
          metricsCache["metrics-genres"] = { items };
          return metricsCache["metrics-genres"];
        } catch (e) {
          console.error("Error calculating top genres:", e);
          return { items: [] };
        }
      },
    },
  };

  // --- Render Logic ---
  function render() {
    const doRender = () => {
      feed.hidden = true;
      settingsView.hidden = true;
      shareView.hidden = true;
      if (controlsBar) controlsBar.style.display = "none";
      if (bottomControls) bottomControls.style.display = "none";

      if (currentView === "settings") {
        viewTitle.textContent = "Settings";
        settingsView.hidden = false;
        updateNavActiveState();
        return;
      }

      if (currentView === "share") {
        viewTitle.textContent = "Share & Export";
        shareView.hidden = false;
        renderSharePage();
        updateNavActiveState();
        return;
      }

      if (METRIC_VIEWS[currentView]) {
        viewTitle.textContent = METRIC_VIEWS[currentView].title;
        feed.hidden = false;
        renderMetricsView(currentView);
        updateNavActiveState();
        return;
      }

      feed.hidden = false;
      if (controlsBar) controlsBar.style.display = "flex";
      if (bottomControls) bottomControls.style.display = "flex";

      if (currentView === "date" && selectedDate) {
        const [y, m, d] = selectedDate.split("-").map(Number);
        viewTitle.textContent = new Date(
          Date.UTC(y, m - 1, d),
        ).toLocaleDateString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        renderDateView();
      } else {
        viewTitle.textContent = "All dates";
        const sortedDates = Object.keys(dateGroups).sort().reverse();
        renderHomeView(sortedDates);
      }
      updateNavActiveState();
    };

    if (document.startViewTransition) {
      document.startViewTransition(() => doRender());
    } else {
      doRender();
    }
  }

  // --- Share Logic (QR) ---
  function renderSharePage() {
    let username = document.getElementById("usernameInput")?.value || auth.currentUser.uid;
    const url = `${window.location.origin}/${username}`;
    document.getElementById("shareUrlInput").value = url;
    const container = document.getElementById("qrcode");
    container.innerHTML = "";
    try {
      new QRCode(container, {
        text: url,
        width: 180,
        height: 180,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    } catch (e) {
      console.warn("QR lib not loaded", e);
    }
  }

  // --- Metrics Render ---
  function renderMetricsView(key) {
    const config = METRIC_VIEWS[key];
    const data = config.getData(100);
    feed.innerHTML = "";
    const list = document.createElement("ol");
    list.className = "metrics-list";
    const maxCount = data.items[0]?.count || 1;

    data.items.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = "metrics-item";
      let thumb = "";
      if (key === "metrics-songs") {
        thumb = `<div class="metrics-thumb" style="background-image: url('${item.artworkUrl?.replace(/'/g, "\\'")}')"></div>`;
      }
      li.innerHTML = `
            <span class="metrics-rank">${i + 1}</span>
            ${thumb}
            <div class="metrics-info">
                <span class="metrics-label">${escapeHtml(item.label)}</span>
                ${item.sublabel ? `<span class="metrics-sublabel">${escapeHtml(item.sublabel)}</span>` : ""}
                <span class="metrics-count">${item.count} requests</span>
                <div class="metrics-bar"><span class="metrics-bar-fill" style="width:${Math.min((item.count / maxCount) * 100, 100)}%"></span></div>
            </div>
          `;
      list.appendChild(li);
    });
    feed.appendChild(list);
  }

  function renderHomeView(dates) {
    feed.innerHTML = "";
    if (!dates.length) {
      feed.innerHTML = `<p style="text-align:center;color:var(--text-secondary)">No requests yet.</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    dates.forEach((iso) => {
      const info = dateGroups[iso];
      const link = document.createElement("a");
      link.className = "date-link";
      link.href = "#";
      link.innerHTML = `${iso} <small>${info.count} requests</small>`;
      link.onclick = (e) => {
        e.preventDefault();
        selectedDate = iso;
        currentView = "date";
        render();
      };
      frag.appendChild(link);
    });
    feed.appendChild(frag);
  }

  function renderDateView() {
    feed.innerHTML = "";
    let items = Object.values(requestsMap).filter(
      (r) => normalizeGigDate(r.timestamp) === selectedDate,
    );
    
    // Status Filter
    if (activeStatus === "played") items = items.filter(r => r.fulfilled);
    else if (activeStatus === "unplayed") items = items.filter(r => !r.fulfilled);
    
    // Genre Filter
    if (activeGenre !== "all") items = items.filter(r => (r.genre || "") === activeGenre);
    
    // Decade Filter
    if (activeDecade !== "all") items = items.filter(r => {
      const yr = parseInt(r.releaseYear);
      if (isNaN(yr)) return false;
      return (Math.floor(yr / 10) * 10 + "s") === activeDecade;
    });

    // Sort Order
    if (activeSort === "lastRequested" || activeSort === "latestAdded") {
      items.sort((a, b) => b.timestamp - a.timestamp);
    } else if (activeSort === "earliestAdded") {
      items.sort((a, b) => a.timestamp - b.timestamp);
    } else if (activeSort === "mostRequested") {
      items.sort((a, b) => (b.count || 1) - (a.count || 1));
    }

    const frag = document.createDocumentFragment();
    if (items.length === 0) {
      const p = document.createElement("p");
      p.style.cssText = "text-align:center;color:var(--text-secondary);padding:2rem 0;";
      p.textContent = "No requests match your filters.";
      frag.appendChild(p);
    } else {
      items.forEach((req) => frag.appendChild(createCard(req)));
    }
    feed.appendChild(frag);
  }

  function createCard(req) {
    const el = document.createElement("article");
    el.className = "card" + (req.fulfilled ? " fulfilled" : "");
    el.dataset.id = req.key;
    el.innerHTML = `
        <img src="${req.artworkUrl}" class="card-thumb">
        <div class="card-content">
           <div class="card-title">${escapeHtml(req.title)}</div>
           <div class="card-artist">${escapeHtml(req.artist)}</div>
           <div class="card-metadata">${escapeHtml([req.genre, req.releaseYear].filter(Boolean).join(" | "))}</div>
           <div class="card-time">${msToTimeAgo(req.timestamp)}</div>
           <div class="card-actions"><button class="delete-link">Delete</button></div>
        </div>
        <label class="checkbox-container"><input type="checkbox" ${req.fulfilled ? "checked" : ""} class="checkbox"><span class="checkmark"></span></label>
      `;
    return el;
  }

  function updateNavActiveState() {
    const links = navDrawer.querySelectorAll(".nav-link");
    links.forEach((l) => l.classList.remove("is-active"));
    if (currentView === "home")
      navDrawer.querySelector("[data-nav-home]")?.classList.add("is-active");
    else if (currentView === "settings")
      navDrawer
        .querySelector("[data-nav-settings]")
        ?.classList.add("is-active");
    else if (currentView === "share")
      navDrawer.querySelector("[data-nav-share]")?.classList.add("is-active");
    else if (METRIC_VIEWS[currentView])
      navDrawer
        .querySelector(`[data-metrics-view="${currentView}"]`)
        ?.classList.add("is-active");
  }

  // --- Data Sync (MULTI-TENANT ROUTING) ---
  function subscribeRequests(uid) {
    if (unsubscribeRequests) {
      unsubscribeRequests();
    }
    
    // Step 1 Routing: Pulls strictly from users/{uid}/requests
    unsubscribeRequests = onSnapshot(query(collection(db, "users", uid, "requests")), (snap) => {
      try {
        snap.docChanges().forEach(({ doc, type }) => {
          if (type === "removed") {
            delete requestsMap[doc.id];
          } else {
            const data = doc.data();
            let ts = data.timestamp;
            if (!ts) ts = Date.now();
            else if (ts.toMillis) ts = ts.toMillis();
            else if (ts.seconds) ts = ts.seconds * 1000;
            else if (typeof ts === "string") ts = new Date(ts).getTime() || Date.now();
            
            data.timestamp = ts;
            requestsMap[doc.id] = { ...data, key: doc.id };
          }
        });
        dateGroups = {};
        const genres = new Set();
        const decades = new Set();

        Object.values(requestsMap).forEach((r) => {
          const d = normalizeGigDate(r.timestamp);
          if (!dateGroups[d]) dateGroups[d] = { count: 0 };
          dateGroups[d].count++;
          
          if (r.genre) genres.add(r.genre);
          if (r.releaseYear) {
            const yr = parseInt(r.releaseYear);
            if (!isNaN(yr)) decades.add(Math.floor(yr / 10) * 10 + "s");
          }
        });
        
        // Update Filter DOM
        const genreSel = document.getElementById("genreFilter");
        if (genreSel) {
          genreSel.innerHTML = '<option value="all">Genre: All</option>' + 
            [...genres].sort().map(g => `<option value="${escapeHtml(g)}" ${activeGenre === g ? "selected" : ""}>${escapeHtml(g)}</option>`).join("");
        }
        
        const decadeSel = document.getElementById("decadeFilter");
        if (decadeSel) {
          decadeSel.innerHTML = '<option value="all">Decade: All</option>' + 
            [...decades].sort().reverse().map(d => `<option value="${d}" ${activeDecade === d ? "selected" : ""}>${d}</option>`).join("");
        }
        
        metricsCache = {}; // Invalidate cache
        render();
      } catch (error) {
        console.error("Error processing requests snapshot:", error);
      }
    }, (error) => {
      console.error("Error listening to requests:", error);
      customAlert("Failed to load requests. Please check your permissions or network connection.", "Error");
    });
  }

  // --- Event Listeners ---
  if (navDrawer) {
    navDrawer.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (!link) return;
      e.preventDefault();
      if (link.dataset.navHome !== undefined) {
        currentView = "home";
        selectedDate = null;
      } else if (link.dataset.navSettings !== undefined) {
        currentView = "settings";
      } else if (link.dataset.navShare !== undefined) {
        currentView = "share";
      } else if (link.dataset.metricsView) {
        currentView = link.dataset.metricsView;
      }
      render();
      document.body.classList.remove("drawer-open");
    });
  }

  document
    .getElementById("settingsForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("saveSettingsBtn");
      btn.textContent = "Saving...";
      try {
        let photoURL = null;
        const photoFile = document.getElementById("photoInput").files[0];
        if (photoFile) {
          const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js");
          const { storage } = await import("./firebase-config.js");
          const storageRef = ref(storage, `profiles/${auth.currentUser.uid}/${photoFile.name}`);
          const snapshot = await uploadBytes(storageRef, photoFile);
          photoURL = await getDownloadURL(snapshot.ref);
          const photoPreview = document.getElementById("photoPreview");
          if (photoPreview) {
            photoPreview.src = photoURL;
            photoPreview.style.display = "block";
          }
        }
        
        const updateData = {
            username: document.getElementById("usernameInput").value.trim().toLowerCase(),
            djName: document.getElementById("djNameInput").value.trim(),
            aboutText: document.getElementById("aboutTextInput").value.trim(),
            instagram: document.getElementById("instagramInput").value.trim(),
            tiktok: document.getElementById("tiktokInput").value.trim(),
            youtube: document.getElementById("youtubeInput").value.trim(),
            soundcloud: document.getElementById("soundcloudInput").value.trim(),
            mixcloud: document.getElementById("mixcloudInput").value.trim(),
            patreon: document.getElementById("patreonInput").value.trim(),
            bandcamp: document.getElementById("bandcampInput").value.trim(),
            website: document.getElementById("websiteInput").value.trim(),
            tipHeader: document.getElementById("tipHeaderInput").value.trim(),
            tipDesc: document.getElementById("tipDescInput").value.trim(),
            applePayLink: document.getElementById("applePayInput").value.trim(),
            googlePayLink: document
              .getElementById("googlePayInput")
              .value.trim(),
            paypalLink: document.getElementById("paypalInput").value.trim(),
        };
        
        if (photoURL) {
            updateData.photoURL = photoURL;
        }

        await setDoc(doc(db, "users", auth.currentUser.uid), updateData, { merge: true });
        customAlert("Saved!");
      } catch (e) {
        customAlert("Error");
        console.error(e);
      }
      btn.textContent = "Save Profile";
    });

  document.getElementById("copyShareBtn")?.addEventListener("click", () => {
    const url = document.getElementById("shareUrlInput").value;
    navigator.clipboard.writeText(url).then(() => customAlert("Link copied!"));
  });

  document.getElementById("downloadQrBtn")?.addEventListener("click", () => {
    const img = document.querySelector("#qrcode img");
    if (img) {
      const a = document.createElement("a");
      a.href = img.src;
      a.download = "requestcue-qr.png";
      a.click();
    }
  });

  document.getElementById("shareLinkBtn")?.addEventListener("click", () => {
    let username = document.getElementById("usernameInput")?.value || auth.currentUser.uid;
    const url = `${window.location.origin}/${username}`;
    navigator.clipboard.writeText(url).then(() => customAlert("Link copied!"));
  });

  document
    .getElementById("signOutBtn")
    ?.addEventListener("click", () => {
      if (unsubscribeRequests) {
        unsubscribeRequests();
        unsubscribeRequests = null;
      }
      signOut(auth);
    });

  // --- AUTH SUBMIT (Automated Onboarding) ---
  document.getElementById("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("emailInput").value;
    const pass = document.getElementById("passwordInput").value;
    const isSignup = document
      .getElementById("authTitle")
      .textContent.includes("Sign Up");

    try {
      if (isSignup) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          pass,
        );
        // AUTOMATED ONBOARDING DEFAULTS
        await setDoc(doc(db, "users", userCredential.user.uid), {
          username: userCredential.user.uid.slice(0, 8),
          djName: "Resident DJ",
          tipHeader: "Buy the DJ a drink",
          tipDesc: "It's thirsty work cooking this hard.",
          tipEmoji: "🍻",
          createdAt: fbServerTimestamp(),
        });
        customAlert("Welcome to RequestCue! Your booth is ready. Head over to Settings to customize your public page.");
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e) {
      document.getElementById("authError").textContent = e.message;
      document.getElementById("authError").hidden = false;
    }
  });

  document.getElementById("toggleAuthBtn")?.addEventListener("click", () => {
    const t = document.getElementById("authTitle");
    const isLogin = t.textContent.includes("Login");
    t.textContent = isLogin ? "DJ Dashboard Sign Up" : "DJ Dashboard Login";
    document.getElementById("authPrimaryBtn").textContent = isLogin
      ? "Sign Up"
      : "Sign In";
  });

  // Feed Actions (MULTI-TENANT ROUTING)
  document
    .getElementById("clearAllBtn")
    ?.addEventListener("click", async () => {
      if (await customConfirm("Clear requests?")) {
        // Batch delete inside user's sub-collection
        const reqsRef = collection(
          db,
          "users",
          auth.currentUser.uid,
          "requests",
        );
        const snapshot = await getDocs(query(reqsRef));
        const batch = writeBatch(db);
        snapshot.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    });

  feed.addEventListener("click", async (e) => {
    if (e.target.classList.contains("delete-link")) {
      const card = e.target.closest(".card");
      const id = card.dataset.id;
      if (await customConfirm("Delete?")) {
        // Optimistic UI: Hide immediately
        card.style.display = "none";
        deleteDoc(doc(db, "users", auth.currentUser.uid, "requests", id)).catch(err => {
            console.error("Failed to delete", err);
            card.style.display = ""; // Revert
            customAlert("Failed to delete. Please check your connection.", "Error");
        });
      }
    }
  });
  feed.addEventListener("change", (e) => {
    if (e.target.classList.contains("checkbox")) {
      const card = e.target.closest(".card");
      const id = card.dataset.id;
      const checked = e.target.checked;
      
      // Optimistic UI: Update class immediately
      if (checked) card.classList.add("fulfilled");
      else card.classList.remove("fulfilled");
      
      updateDoc(doc(db, "users", auth.currentUser.uid, "requests", id), {
        fulfilled: checked,
      }).catch(err => {
        console.error("Failed to update", err);
        // Revert on error
        e.target.checked = !checked;
        if (!checked) card.classList.add("fulfilled");
        else card.classList.remove("fulfilled");
        customAlert("Failed to update status. Please check your connection.", "Error");
      });
    }
  });

  // Filter Event Listeners
  document.getElementById("statusFilter")?.addEventListener("change", e => { activeStatus = e.target.value; render(); });
  document.getElementById("sortOrder")?.addEventListener("change", e => { activeSort = e.target.value; render(); });
  document.getElementById("genreFilter")?.addEventListener("change", e => { activeGenre = e.target.value; render(); });
  document.getElementById("decadeFilter")?.addEventListener("change", e => { activeDecade = e.target.value; render(); });
}
