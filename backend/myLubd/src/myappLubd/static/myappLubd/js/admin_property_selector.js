document.addEventListener('DOMContentLoaded', () => {
  const selector = document.getElementById('admin-property');
  selector?.addEventListener('change', () => selector.form.requestSubmit());
});
