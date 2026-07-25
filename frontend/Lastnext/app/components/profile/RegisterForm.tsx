import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FormField from "./FormField";
import { RegisterFormData, ErrorState } from "@/app/lib/types";
import axios from "axios";
import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);

  const validateForm = (formData: FormData): boolean => {
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError({ message: "Passwords do not match", field: "confirmPassword" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    if (!validateForm(formData)) {
      setLoading(false);
      return;
    }

    const registrationData: RegisterFormData = {
      username: formData.get("username") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    try {
      const response = await axios.post(
        `${API_URL}/api/v1/auth/register/`,
        registrationData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        },
      );

      if (response.data.access) {
        router.push("/auth/login");
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errors = error.response?.data;

        if (typeof errors === "object") {
          const firstError = Object.values(errors)[0];
          setError({
            message: Array.isArray(firstError)
              ? firstError[0]
              : String(firstError),
            field: Object.keys(errors)[0],
          });
        } else {
          setError({
            message: errors?.detail || errors?.message || "Registration failed",
          });
        }
      } else {
        setError({ message: "Registration failed" });
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <span className="font-semibold">Unable to create account.</span>{" "}
          {error.message}
        </div>
      )}

      <div className="space-y-4">
        <FormField
          id="username"
          label="Username"
          autoComplete="username"
          placeholder="Choose a username"
          error={error?.field === "username" ? error.message : undefined}
        />
        <FormField
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="name@hotel.com"
          error={error?.field === "email" ? error.message : undefined}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a secure password"
          error={error?.field === "password" ? error.message : undefined}
        />
        <FormField
          id="confirmPassword"
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          placeholder="Enter your password again"
          error={error?.field === "confirmPassword" ? error.message : undefined}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:pointer-events-none disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating account…
          </>
        ) : (
          <>
            Create account
            <ArrowRight className="ml-auto h-4 w-4" />
          </>
        )}
      </button>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
        <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-blue-50 text-blue-700">
          <LockKeyhole className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs leading-5 text-slate-600">
          By creating an account, you agree to use HotelCare Pro only for your
          authorized properties and operational responsibilities.
        </p>
      </div>

      <div className="text-center">
        <Link
          href="/auth/login"
          className="text-sm text-slate-500"
        >
          Already have an account?{" "}
          <span className="font-semibold text-blue-700 underline-offset-4 hover:underline">
            Sign in
          </span>
        </Link>
      </div>
    </form>
  );
}
