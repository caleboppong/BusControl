import { useState } from "react";
import { signIn } from "../../services/authService.js";

function Login({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();

        if (!email.trim() || !password) {
            setError("Enter your email address and password.");
            return;
        }

        try {
            setLoading(true);
            setError("");

            const data = await signIn(email, password);

            if (!data?.session) {
                throw new Error("Unable to create a login session.");
            }

            await onLogin(data.session);
        } catch (err) {
            setError(err.message || "Unable to sign in.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-brand">
                    <div className="login-logo">BC</div>
                    <span className="eyebrow">BUSCONTROL</span>
                    <h1>Operations Login</h1>
                    <p>
                        Secure access to London bus control operations.
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="login-email">
                        Email address
                    </label>

                    <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.target.value)
                        }
                        placeholder="name@example.com"
                        disabled={loading}
                    />

                    <label htmlFor="login-password">
                        Password
                    </label>

                    <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) =>
                            setPassword(event.target.value)
                        }
                        placeholder="Enter password"
                        disabled={loading}
                    />

                    <label className="login-password-toggle">
                        <input
                            type="checkbox"
                            checked={showPassword}
                            onChange={(event) =>
                                setShowPassword(event.target.checked)
                            }
                        />
                        Show password
                    </label>

                    {error && (
                        <div className="login-error">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="primary"
                        disabled={loading}
                    >
                        {loading ? "Signing in..." : "Sign in"}
                    </button>
                </form>

                <div className="login-security">
                    <strong>Authorised personnel only</strong>
                    <span>
                        Access is controlled according to your
                        BusControl operational role.
                    </span>
                </div>
            </section>
        </main>
    );
}

export default Login;