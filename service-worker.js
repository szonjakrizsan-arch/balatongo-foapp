self.addEventListener("install", (event) => {
  console.log("Service Worker telepítve");
});

self.addEventListener("fetch", (event) => {
  // egyelőre nem cache-elünk semmit
});
