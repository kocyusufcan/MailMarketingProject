import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { API_URL } from '@/constants/Config';

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const [step, setStep] = useState(1); // 1: Email, 2: Code, 3: New Passwords
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Timer states
    const [timer, setTimer] = useState(60);
    const [isTimerActive, setIsTimerActive] = useState(false);
    const intervalRef = useRef<any>(null);

    useEffect(() => {
        if (isTimerActive && timer > 0) {
            intervalRef.current = setInterval(() => {
                setTimer((prev) => prev - 1);
            }, 1000);
        } else if (timer === 0) {
            setIsTimerActive(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isTimerActive, timer]);

    const startTimer = () => {
        setTimer(60);
        setIsTimerActive(true);
    };

    const handleSendCode = async () => {
        if (!email) {
            Alert.alert("Hata", "Lütfen e-posta adresinizi girin.");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/Auth/forgot-password`, { email });
            Alert.alert("Başarılı", response.data.message);
            setStep(2);
            startTimer();
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Bir hata oluştu.";
            Alert.alert("Hata", errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (!code) {
            Alert.alert("Hata", "Lütfen doğrulama kodunu girin.");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/Auth/verify-code`, { email, code });
            setStep(3);
            setIsTimerActive(false); // Kod onaylandıysa sayacı durdur
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Kod doğrulanamadı.";
            Alert.alert("Hata", errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!newPassword || !confirmPassword) {
            Alert.alert("Hata", "Lütfen tüm alanları doldurun.");
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert("Hata", "Şifreler eşleşmiyor.");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/Auth/reset-password`, {
                email,
                code,
                newPassword,
                confirmPassword
            });
            Alert.alert("Başarılı", response.data.message, [
                { text: "Giriş Yap", onPress: () => router.replace('/login') }
            ]);
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Bir hata oluştu.";
            Alert.alert("Hata", errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        if (step === 1) router.back();
        else if (step === 2) setStep(1);
        else if (step === 3) setStep(2);
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                    <Ionicons name="arrow-back" size={24} color="#1e293b" />
                </TouchableOpacity>

                <View style={styles.main}>
                    <Text style={styles.title}>Şifremi Unuttum</Text>

                    {step === 1 && (
                        <>
                            <Text style={styles.sub}>Şifrenizi sıfırlama talimatları için kayıtlı e-posta adresinizi yazın.</Text>
                            <View style={styles.inputContainer}>
                                <TextInput placeholderTextColor="#64748b"
                                    style={styles.inputStyle}
                                    placeholder="E-posta"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                                {email.length > 0 && (
                                    <TouchableOpacity style={styles.clearBtn} onPress={() => setEmail('')}>
                                        <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TouchableOpacity
                                style={[styles.button, loading && { opacity: 0.7 }]}
                                onPress={handleSendCode}
                                disabled={loading}
                            >
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>KOD GÖNDER</Text>}
                            </TouchableOpacity>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Text style={styles.sub}>E-posta adresinize gelen 6 haneli kodu girin.</Text>

                            <View style={styles.timerContainer}>
                                <Text style={[styles.timerText, timer === 0 && styles.timerExpired]}>
                                    {timer > 0 ? `Kalan Süre: ${timer}s` : "Süre Doldu!"}
                                </Text>
                                {timer === 0 && (
                                    <TouchableOpacity onPress={handleSendCode} disabled={loading}>
                                        <Text style={styles.resendText}>Yeniden Kod Gönder</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.inputContainer}>
                                <TextInput placeholderTextColor="#64748b"
                                    style={[styles.inputStyle, timer === 0 && styles.inputDisabled]}
                                    placeholder="Doğrulama Kodu"
                                    value={code}
                                    onChangeText={setCode}
                                    keyboardType="number-pad"
                                    editable={timer > 0}
                                />
                                {code.length > 0 && timer > 0 && (
                                    <TouchableOpacity style={styles.clearBtn} onPress={() => setCode('')}>
                                        <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <TouchableOpacity
                                style={[styles.button, (loading || timer === 0) && { opacity: 0.7 }]}
                                onPress={handleVerifyCode}
                                disabled={loading || timer === 0}
                            >
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>KODU DOĞRULA</Text>}
                            </TouchableOpacity>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Text style={styles.sub}>Şimdi yeni şifrenizi belirleyebilirsiniz.</Text>

                            <View style={styles.inputContainer}>
                                <TextInput placeholderTextColor="#64748b"
                                    style={styles.inputStyle}
                                    placeholder="Yeni Şifre"
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    secureTextEntry
                                />
                                {newPassword.length > 0 && (
                                    <TouchableOpacity style={styles.clearBtn} onPress={() => setNewPassword('')}>
                                        <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.inputContainer}>
                                <TextInput placeholderTextColor="#64748b"
                                    style={styles.inputStyle}
                                    placeholder="Yeni Şifre Tekrar"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry
                                />
                                {confirmPassword.length > 0 && (
                                    <TouchableOpacity style={styles.clearBtn} onPress={() => setConfirmPassword('')}>
                                        <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <TouchableOpacity
                                style={[styles.button, loading && { opacity: 0.7 }]}
                                onPress={handleResetPassword}
                                disabled={loading}
                            >
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>ŞİFREYİ GÜNCELLE</Text>}
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                <TouchableOpacity style={styles.footer} onPress={() => router.replace('/login')}>
                    <Text style={styles.footerText}>Giriş ekranına geri dön</Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    scrollContent: { flexGrow: 1, padding: 30 },
    backBtn: { marginTop: 40, alignSelf: 'flex-start' },
    main: { flex: 1, justifyContent: 'center' },
    title: { fontSize: 32, fontWeight: '900', color: '#333', marginBottom: 10 },
    sub: { fontSize: 16, color: '#64748b', marginBottom: 20, lineHeight: 22 },
    timerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    timerText: { fontSize: 14, color: '#6366f1', fontWeight: 'bold' },
    timerExpired: { color: '#ef4444' },
    resendText: { fontSize: 14, color: '#6366f1', fontWeight: 'bold', textDecorationLine: 'underline' },
    inputContainer: { position: 'relative', marginBottom: 15 },
    inputStyle: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 18, paddingRight: 50, fontSize: 16, color: '#333' },
    clearBtn: { position: 'absolute', right: 15, top: 18 },
    inputDisabled: { backgroundColor: '#f1f5f9', color: '#94a3b8' },
    button: { backgroundColor: '#333', height: 65, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    buttonText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
    footer: { marginTop: 20, marginBottom: 20, alignItems: 'center' },
    footerText: { color: '#6366f1', fontWeight: 'bold' }
});
