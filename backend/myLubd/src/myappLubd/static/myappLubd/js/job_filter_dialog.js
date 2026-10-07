(function () {
  "use strict";

  function initJobFilterDialog() {
    var dialog = document.getElementById("job-filter-dialog");
    var openButton = document.querySelector("[data-job-filter-open]");

    if (!dialog || !openButton || typeof dialog.showModal !== "function") {
      return;
    }

    var closeButtons = dialog.querySelectorAll("[data-job-filter-close]");
    var countBadge = openButton.querySelector("[data-job-filter-count]");
    var lastFocusedElement = null;

    function updateActiveFilterCount() {
      if (!countBadge) return;

      var activeCount = 0;
      dialog.querySelectorAll("#changelist-filter li.selected").forEach(function (item) {
        var list = item.closest("ul");
        if (list && item !== list.firstElementChild) activeCount += 1;
      });

      countBadge.hidden = activeCount === 0;
      countBadge.textContent = String(activeCount);
      openButton.setAttribute(
        "aria-label",
        activeCount ? "Filters, " + activeCount + " active" : "Filters"
      );
    }

    function openDialog() {
      lastFocusedElement = document.activeElement;
      dialog.showModal();
      document.documentElement.classList.add("job-filter-dialog-open");
      var closeButton = dialog.querySelector("[data-job-filter-close]");
      if (closeButton) closeButton.focus();
    }

    function closeDialog() {
      if (dialog.open) dialog.close();
    }

    openButton.addEventListener("click", openDialog);
    closeButtons.forEach(function (button) {
      button.addEventListener("click", closeDialog);
    });

    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      var bounds = dialog.getBoundingClientRect();
      var inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (!inside) closeDialog();
    });

    dialog.addEventListener("close", function () {
      document.documentElement.classList.remove("job-filter-dialog-open");
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    });

    updateActiveFilterCount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initJobFilterDialog);
  } else {
    initJobFilterDialog();
  }
})();
