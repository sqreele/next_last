interface FormFieldProps {
  id: string;
  label: string;
  type?: string;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
}

export default function FormField({
  id,
  label,
  type = "text",
  error,
  autoComplete,
  placeholder,
}: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`relative block h-11 w-full appearance-none rounded-xl border bg-white px-3.5 text-sm text-slate-950 shadow-xs outline-hidden transition placeholder:text-slate-400 focus:ring-4 ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
            : "border-slate-300 focus:border-blue-600 focus:ring-blue-100"
        }`}
        placeholder={placeholder || label}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
