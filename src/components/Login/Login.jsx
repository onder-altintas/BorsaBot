import React, { useState } from 'react';
import { TrendingUp, Lock, User, AlertCircle } from 'lucide-react';
import './Login.css';

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        // Simüle edilmiş gecikme ve doğrulama
        setTimeout(() => {
            const validUsers = [
                { user: 'önder', pass: '123' },
                { user: 'samet', pass: '123' }
            ];

            const foundUser = validUsers.find(
                u => u.user.toLowerCase() === username.toLowerCase() && u.pass === password
            );

            if (foundUser) {
                onLogin(foundUser.user);
            } else {
                setError('Geçersiz kullanıcı adı veya şifre!');
                setIsLoading(false);
            }
        }, 800);
    };

    return (
        <div className="login-container">
            <div className="login-card fade-in">
                <div className="login-header">
                    <div className="login-logo">
                        <TrendingUp size={40} className="text-success" />
                    </div>
                    <h1>BIST Simülatör</h1>
                    <p className="text-secondary text-sm">Devam etmek için lütfen giriş yapın</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="username">Kullanıcı Adı</label>
                        <div className="input-with-icon">
                            <User size={18} className="input-icon" />
                            <input
                                id="username"
                                type="text"
                                placeholder="Kullanıcı adınız"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Şifre</label>
                        <div className="input-with-icon">
                            <Lock size={18} className="input-icon" />
                            <input
                                id="password"
                                type="password"
                                placeholder="••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="login-error slide-in">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button type="submit" className="btn-login" disabled={isLoading}>
                        {isLoading ? (
                            <div className="spinner"></div>
                        ) : (
                            'Giriş Yap'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <p className="text-xs text-secondary">
                        © 2026 BorsaBot Premium Trading Simulator
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
