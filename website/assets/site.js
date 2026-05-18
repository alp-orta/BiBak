const STORAGE_KEY = "bibak_site_language";
const languageButtons = document.querySelectorAll("[data-lang-option]");
const translatableItems = document.querySelectorAll("[data-tr][data-en]");

function setLanguage(language) {
  const nextLanguage = language === "en" ? "en" : "tr";
  document.documentElement.lang = nextLanguage;
  translatableItems.forEach((item) => {
    const value = item.dataset[nextLanguage];
    if (value) item.textContent = value;
  });
  languageButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.langOption === nextLanguage);
  });
  localStorage.setItem(STORAGE_KEY, nextLanguage);
  document.dispatchEvent(new CustomEvent("bibak:languagechange", { detail: nextLanguage }));
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.langOption));
});

setLanguage(localStorage.getItem(STORAGE_KEY) || "tr");

const navLinks = document.querySelectorAll(".nav-links a[href^='#']");
const navSections = Array.from(navLinks)
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);
const stickyNav = document.querySelector(".nav");

function navOffset() {
  return stickyNav ? stickyNav.offsetHeight : 74;
}

function scrollToSection(id, updateHash = true) {
  const section = document.getElementById(id);
  if (!section) return;
  const top = section.getBoundingClientRect().top + window.scrollY - navOffset();
  window.scrollTo({ top, behavior: "smooth" });
  if (updateHash) history.pushState(null, "", `#${id}`);
  window.setTimeout(updateActiveNav, 180);
}

function setActiveNav(id) {
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${id}`;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}

function updateActiveNav() {
  if (!navSections.length) return;
  const hashId = window.location.hash.slice(1);
  if (hashId && navSections.some((section) => section.id === hashId)) {
    const hashSection = document.getElementById(hashId);
    const rect = hashSection.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.55 && rect.bottom > 92) {
      setActiveNav(hashId);
      return;
    }
  }

  const targetLine = window.scrollY + window.innerHeight * 0.35;
  let activeSection = navSections[0];

  navSections.forEach((section) => {
    if (section.offsetTop <= targetLine) activeSection = section;
  });

  setActiveNav(activeSection.id);
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const targetId = link.getAttribute("href").slice(1);
    setActiveNav(targetId);
    scrollToSection(targetId);
  });
});

window.addEventListener("scroll", updateActiveNav, { passive: true });
window.addEventListener("resize", updateActiveNav);
window.addEventListener("hashchange", updateActiveNav);
window.setTimeout(updateActiveNav, 350);
window.setTimeout(() => {
  const hashId = window.location.hash.slice(1);
  if (hashId && document.getElementById(hashId)) scrollToSection(hashId, false);
}, 80);
updateActiveNav();

const productVideo = document.querySelector(".video-frame");
if (productVideo) {
  const videoSection = productVideo.closest(".video-showcase") || productVideo;
  let videoStarted = false;
  let lastAction = "";

  function videoSourceForLanguage(language) {
    return language === "en" ? productVideo.dataset.videoEn : productVideo.dataset.videoTr;
  }

  function setVideoLanguage(language) {
    const source = videoSourceForLanguage(language) || "video.html";
    const currentSource = (productVideo.getAttribute("src") || "").split("?")[0];
    if (currentSource === source) return;
    videoStarted = false;
    lastAction = "";
    productVideo.setAttribute("src", source);
    window.setTimeout(updateVideoPlayback, 100);
  }

  function sendVideoAction(action) {
    if (!productVideo.contentWindow || action === lastAction) return;
    lastAction = action;
    productVideo.contentWindow.postMessage({ type: "bibak-video", action }, "*");
  }

  function updateVideoPlayback() {
    const rect = videoSection.getBoundingClientRect();
    const videoTop = rect.top + window.scrollY;
    const videoBottom = videoTop + rect.height;
    const isVisible = rect.top < window.innerHeight * 0.82 && rect.bottom > window.innerHeight * 0.2;
    const isNearVideo =
      window.scrollY + window.innerHeight * 0.72 >= videoTop && window.scrollY < videoBottom;

    if (isVisible || isNearVideo) {
      if (!videoStarted) {
        videoStarted = true;
        lastAction = "";
        const source = productVideo.getAttribute("src") || "video.html";
        const baseSource = source.split("?")[0];
        productVideo.setAttribute("src", `${baseSource}?autoplay=1&v=${Date.now()}`);
        return;
      }
      sendVideoAction("play");
      return;
    }

    sendVideoAction("pause");
  }

  productVideo.addEventListener("load", () => {
    lastAction = "";
    updateVideoPlayback();
  });
  document.addEventListener("bibak:languagechange", (event) => {
    setVideoLanguage(event.detail);
  });
  window.addEventListener("scroll", updateVideoPlayback, { passive: true });
  window.addEventListener("resize", updateVideoPlayback);
  window.setInterval(updateVideoPlayback, 500);
  requestAnimationFrame(updateVideoPlayback);
  window.setTimeout(updateVideoPlayback, 350);
  window.setTimeout(updateVideoPlayback, 1200);
  setVideoLanguage(document.documentElement.lang);
  updateVideoPlayback();
}
