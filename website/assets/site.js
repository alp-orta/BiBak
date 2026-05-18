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
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.langOption));
});

setLanguage(localStorage.getItem(STORAGE_KEY) || "tr");
