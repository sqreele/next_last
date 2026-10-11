(function () {
  "use strict";

  function initJobFilterDialog() {
    var dialog = document.getElementById("job-filter-dialog");
    var openButton = document.querySelector("[data-job-filter-open]");
    if (!dialog || !openButton || typeof dialog.showModal !== "function") return;

    var groups = Array.prototype.slice.call(dialog.querySelectorAll("[data-job-filter-group]"));
    var summary = dialog.querySelector("[data-job-filter-summary]");
    var emptySummary = dialog.querySelector("[data-job-filter-empty]");
    var clearButton = dialog.querySelector("[data-job-filter-clear]");
    var form = dialog.querySelector("[data-job-filter-form]");
    var cancelButtons = dialog.querySelectorAll("[data-job-filter-cancel]");
    var countBadge = openButton.querySelector("[data-job-filter-count]");
    var draftParams = new URLSearchParams(window.location.search);
    var lastFocusedElement = null;
    if (!summary || !emptySummary || !clearButton || !form) return;

    function optionLinks(group) {
      return Array.prototype.slice.call(group.querySelectorAll("li a[href]"));
    }

    function optionParams(link) {
      return new URL(link.href, window.location.href).searchParams;
    }

    function controlledKeys(group) {
      var links = optionLinks(group);
      var keys = new Set();
      var valuesByKey = Object.create(null);
      links.forEach(function (link) {
        optionParams(link).forEach(function (_value, key) {
          if (!valuesByKey[key]) valuesByKey[key] = new Set();
        });
      });
      Object.keys(valuesByKey).forEach(function (key) {
        links.forEach(function (link) {
          valuesByKey[key].add(JSON.stringify(optionParams(link).getAll(key)));
        });
        if (valuesByKey[key].size > 1) keys.add(key);
      });
      return keys;
    }

    groups.forEach(function (group) {
      group._controlledKeys = controlledKeys(group);
    });

    function groupTitle(group) {
      var filter = group.querySelector("[data-filter-title]");
      if (filter && filter.getAttribute("data-filter-title")) {
        return filter.getAttribute("data-filter-title").trim();
      }
      var heading = group.querySelector("h3");
      return heading ? heading.textContent.trim() : "Filter";
    }

    function defaultLink(group) {
      return optionLinks(group)[0] || null;
    }

    function linkMatchesDraft(group, link) {
      var target = optionParams(link);
      var matches = true;
      group._controlledKeys.forEach(function (key) {
        if (JSON.stringify(draftParams.getAll(key)) !== JSON.stringify(target.getAll(key))) {
          matches = false;
        }
      });
      return matches;
    }

    function selectedLink(group) {
      var links = optionLinks(group);
      for (var index = 0; index < links.length; index += 1) {
        if (linkMatchesDraft(group, links[index])) return links[index];
      }
      return defaultLink(group);
    }

    function setGroupSelection(group, link) {
      var target = optionParams(link);
      group._controlledKeys.forEach(function (key) {
        draftParams.delete(key);
        target.getAll(key).forEach(function (value) {
          draftParams.append(key, value);
        });
      });
    }

    function render() {
      summary.replaceChildren();
      var activeCount = 0;
      groups.forEach(function (group) {
        var links = optionLinks(group);
        var selected = selectedLink(group);
        links.forEach(function (link) {
          var item = link.closest("li");
          var isSelected = link === selected;
          if (item) item.classList.toggle("selected", isSelected);
          link.setAttribute("aria-current", isSelected ? "true" : "false");
        });
        if (!selected || selected === defaultLink(group)) return;
        activeCount += 1;

        var chip = document.createElement("div");
        chip.className = "job-filter-chip";
        var text = document.createElement("span");
        text.className = "job-filter-chip__text";
        var label = document.createElement("strong");
        label.textContent = groupTitle(group) + ": ";
        text.appendChild(label);
        text.appendChild(document.createTextNode(selected.textContent.trim()));
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "job-filter-chip__remove";
        remove.textContent = "\u00d7";
        remove.setAttribute("aria-label", "Remove " + groupTitle(group));
        remove.addEventListener("click", function () {
          var all = defaultLink(group);
          if (all) setGroupSelection(group, all);
          render();
        });
        chip.appendChild(text);
        chip.appendChild(remove);
        summary.appendChild(chip);
      });

      emptySummary.hidden = activeCount > 0;
      clearButton.disabled = activeCount === 0;
      if (countBadge) {
        countBadge.hidden = activeCount === 0;
        countBadge.textContent = String(activeCount);
      }
      openButton.setAttribute("aria-label", activeCount ? "Filters, " + activeCount + " active" : "Filters");
    }

    function resetDraft() {
      draftParams = new URLSearchParams(window.location.search);
      render();
    }

    function closeAndDiscard() {
      resetDraft();
      if (dialog.open) dialog.close();
    }

    groups.forEach(function (group) {
      optionLinks(group).forEach(function (link) {
        link.addEventListener("click", function (event) {
          event.preventDefault();
          setGroupSelection(group, link);
          render();
        });
      });
    });

    openButton.addEventListener("click", function () {
      lastFocusedElement = document.activeElement;
      resetDraft();
      dialog.showModal();
      document.documentElement.classList.add("job-filter-dialog-open");
      var closeButton = dialog.querySelector("[data-job-filter-cancel]");
      if (closeButton) closeButton.focus();
    });
    cancelButtons.forEach(function (button) {
      button.addEventListener("click", closeAndDiscard);
    });
    clearButton.addEventListener("click", function () {
      groups.forEach(function (group) {
        var all = defaultLink(group);
        if (all) setGroupSelection(group, all);
      });
      render();
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      draftParams.delete("p");
      var query = draftParams.toString();
      window.location.assign(window.location.pathname + (query ? "?" + query : ""));
    });
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeAndDiscard();
    });
    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      var bounds = dialog.getBoundingClientRect();
      var inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (!inside) closeAndDiscard();
    });
    dialog.addEventListener("close", function () {
      document.documentElement.classList.remove("job-filter-dialog-open");
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    });
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initJobFilterDialog);
  } else {
    initJobFilterDialog();
  }
})();
