(function () {
  "use strict";

  function initChangelist() {
    var form = document.getElementById("changelist-form");
    if (!form) return;

    // Keep Django's server-generated URLs, including search and other filters.
    // The Jobs dialog manages its own draft selections until Apply is clicked.
    document.querySelectorAll("#changelist-filter details[data-filter-title]").forEach(function (group, index) {
      if (group.closest("dialog")) return;
      var links = Array.from(group.querySelectorAll("li a[href]"));
      var list = group.querySelector("ul");
      if (!links.length || !list) return;
      var label = document.createElement("label");
      var select = document.createElement("select");
      select.id = "admin-list-filter-" + index;
      select.className = "admin-list-filter";
      label.htmlFor = select.id;
      label.className = "admin-list-filter-label";
      label.textContent = group.dataset.filterTitle;
      links.forEach(function (link) {
        var option = document.createElement("option");
        option.value = link.href;
        option.textContent = link.textContent.trim();
        option.selected = link.closest("li").classList.contains("selected");
        select.appendChild(option);
      });
      function navigate() {
        window.location.assign(select.value);
      }
      select.addEventListener("change", navigate);
      var active = links.some(function (link, optionIndex) {
        return optionIndex > 0 && link.closest("li").classList.contains("selected");
      });
      group.classList.toggle("admin-filter-active", active);
      if (active) {
        var reset = document.createElement("a");
        reset.href = links[0].href;
        reset.className = "admin-list-filter-reset";
        reset.textContent = "Clear";
        reset.setAttribute("aria-label", "Clear " + group.dataset.filterTitle + " filter");
        group.appendChild(reset);
      }
      group.insertBefore(label, list);
      group.insertBefore(select, list);
      list.hidden = true;
      // Replace the collapsible heading only after the working select exists.
      var summary = group.querySelector("summary");
      if (summary) summary.remove();
      // Django restores saved <details> states after this script runs. A plain
      // group keeps these controls visible even when a saved filter was closed.
      var panel = document.createElement("div");
      panel.className = group.className + " admin-filter-group";
      panel.dataset.filterTitle = group.dataset.filterTitle;
      while (group.firstChild) panel.appendChild(group.firstChild);
      group.replaceWith(panel);
    });

    var bars = Array.from(form.querySelectorAll(".actions"));
    bars.forEach(function (bar, index) {
      var action = bar.querySelector("select[name=action]");
      var button = bar.querySelector("button[name=index]");
      if (!action || !button) return;
      var help = document.createElement("p");
      help.className = "admin-action-help";
      help.textContent = "Select rows, choose an action, then apply.";
      bar.appendChild(help);
      var error = document.createElement("p");
      error.id = "admin-action-error-" + index;
      error.className = "admin-action-error";
      error.setAttribute("role", "alert");
      error.hidden = true;
      bar.appendChild(error);
      action.setAttribute("aria-describedby", error.id);

      form.addEventListener("submit", function (event) {
        // Leave Save and action confirmation forms to Django.
        if (event.submitter !== button) return;
        var selected = form.querySelector("input.action-select:checked");
        var across = form.querySelector("input.select-across[value='1']");
        var message = !action.value ? "Choose an action first." :
          (!selected && !across ? "Select at least one row first." : "");
        error.textContent = message;
        error.hidden = !message;
        if (message) {
          event.preventDefault();
          if (!action.value) action.focus();
          else {
            var checkbox = form.querySelector("input.action-select");
            if (checkbox) checkbox.focus();
          }
        }
      });
      form.addEventListener("change", function () {
        error.hidden = true;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChangelist);
  } else {
    initChangelist();
  }
})();
