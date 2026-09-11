export function resolveClientLocale(storedLocale, initialLocale, supportedLocales) {
  return supportedLocales.includes(storedLocale) ? storedLocale : initialLocale;
}

export function interpolateTranslation(template, values) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}
