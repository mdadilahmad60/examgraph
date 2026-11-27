/* ExamGrapher motion: header shadow on scroll and a one-time reveal for cards that start below the screen.
   Everything is optional: without JavaScript, or with reduced motion, content is simply visible. */
(function () {
  "use strict";
  var header = document.querySelector(".app-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 4); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var seen = new IntersectionObserver(function (entries) {
    var order = 0;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      seen.unobserve(el);
      el.style.transitionDelay = Math.min(order++, 5) * 60 + "ms";
      el.classList.add("reveal-in");
      /* hand the element back to its normal hover transitions afterwards */
      setTimeout(function () { el.classList.remove("reveal", "reveal-in"); el.style.transitionDelay = ""; }, 900);
    });
  }, { rootMargin: "0px 0px -40px 0px" });
  Array.prototype.forEach.call(document.querySelectorAll(".cat-card, .tool-card, .worked, .signup"), function (el) {
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add("reveal");
    seen.observe(el);
  });
})();
