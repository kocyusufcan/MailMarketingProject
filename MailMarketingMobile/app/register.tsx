import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function RegisterScreen() {
    const router = useRouter();
    const { showAlert } = useAlert();

    // Form States
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(true);
    const [invitationCode, setInvitationCode] = useState('');

    // UI/Flow States
    const [step, setStep] = useState(1); // 1: Form, 2: Activation
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [timer, setTimer] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const timerRef = useRef<any>(null);

    // Timer Logic
    useEffect(() => {
        if (step === 2 && timer > 0) {
            timerRef.current = setInterval(() => {
                setTimer((prev) => prev - 1);
            }, 1000);
        } else if (timer === 0) {
            setCanResend(true);
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [step, timer]);

    const handleRegister = async () => {
        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            showAlert({ title: "Uyarı", message: "Lütfen tüm alanları doldurun.", type: 'warning' });
            return;
        }

        if (!isAdmin && !invitationCode) {
            showAlert({ title: "Uyarı", message: "Kullanıcı kaydı için davet kodu zorunludur.", type: 'warning' });
            return;
        }

        if (password !== confirmPassword) {
            showAlert({ title: "Uyarı", message: "Şifreler eşleşmiyor.", type: 'warning' });
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/Auth/register`, {
                firstName,
                lastName,
                email,
                password,
                confirmPassword,
                isAdmin,
                invitationCode: isAdmin ? null : invitationCode
            });

            showAlert({ title: "Kod Gönderildi", message: response.data.message || "Aktivasyon kodu e-postanıza gönderildi.", type: 'info' });
            setStep(2);
            setTimer(60);
            setCanResend(false);
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Kayıt işlemi sırasında bir hata oluştu.";
            showAlert({ title: "Hata", message: errorMsg, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyActivation = async () => {
        if (!code || code.length < 6) {
            showAlert({ title: "Uyarı", message: "Lütfen 6 haneli aktivasyon kodunu giriniz.", type: 'warning' });
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/Auth/verify-activation`, {
                email,
                code
            });

            showAlert({
                title: "Başarılı",
                message: response.data.message || "Hesabınız aktive edildi.",
                type: 'success',
                showCancel: false,
                confirmText: "Giriş Yap",
                onConfirm: () => router.replace('/login')
            });
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Kod doğrulanamadı.";
            Alert.alert("Hata", errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        if (!canResend) return;
        setLoading(true);
        try {
            await axios.post(`${API_URL}/Auth/resend-activation`, {
                email
            });
            showAlert({ title: "Başarılı", message: "Yeni aktivasyon kodu gönderildi.", type: 'success' });
            setTimer(60);
            setCanResend(false);
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Kod gönderilemedi.";
            Alert.alert("Hata", errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const renderStep1 = () => (
        <View style={styles.content}>
            <Text style={styles.title}>Kayıt Ol</Text>
            <Text style={styles.sub}>Yeni bir hesap oluşturarak başlayın.</Text>

            <View style={styles.roleContainer}>
                <Text style={styles.roleLabel}>KAYIT AMACI</Text>
                <View style={styles.segmentContainer}>
                    <TouchableOpacity
                        style={[styles.segment, isAdmin && styles.segmentActive]}
                        onPress={() => { setIsAdmin(true); setInvitationCode(''); }}
                    >
                        <Text style={[styles.segmentText, isAdmin && styles.segmentTextActive]}>Yeni Ekip Kur</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.segment, !isAdmin && styles.segmentActive]}
                        onPress={() => setIsAdmin(false)}
                    >
                        <Text style={[styles.segmentText, !isAdmin && styles.segmentTextActive]}>Ekibe Katıl</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.roleInfo}>
                    {isAdmin
                        ? "Yönetici olarak yeni bir organizasyon ve davet kodu oluşturacaksınız."
                        : "Bir yöneticiden aldığınız davet kodu ile mevcut bir ekibe katılacaksınız."}
                </Text>
            </View>

            <View style={styles.form}>
                {!isAdmin && (
                    <View style={styles.inputContainer}>
                        <TextInput placeholderTextColor="#64748b"
                            style={[styles.inputStyle, styles.highlightInput]}
                            placeholder="Davet Kodu (Zorunlu)"
                            value={invitationCode}
                            onChangeText={setInvitationCode}
                            autoCapitalize="characters"
                        />
                        {invitationCode.length > 0 && (
                            <TouchableOpacity style={styles.clearBtn} onPress={() => setInvitationCode('')}>
                                <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                <View style={styles.inputContainer}>
                    <TextInput placeholderTextColor="#64748b" style={styles.inputStyle} placeholder="Adınız" value={firstName} onChangeText={setFirstName} />
                    {firstName.length > 0 && (
                        <TouchableOpacity style={styles.clearBtn} onPress={() => setFirstName('')}>
                            <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.inputContainer}>
                    <TextInput placeholderTextColor="#64748b" style={styles.inputStyle} placeholder="Soyadınız" value={lastName} onChangeText={setLastName} />
                    {lastName.length > 0 && (
                        <TouchableOpacity style={styles.clearBtn} onPress={() => setLastName('')}>
                            <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                        </TouchableOpacity>
                    )}
                </View>
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
                <View style={styles.inputContainer}>
                    <TextInput placeholderTextColor="#64748b" style={styles.inputStyle} placeholder="Şifre" value={password} onChangeText={setPassword} secureTextEntry />
                    {password.length > 0 && (
                        <TouchableOpacity style={styles.clearBtn} onPress={() => setPassword('')}>
                            <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.inputContainer}>
                    <TextInput placeholderTextColor="#64748b" style={styles.inputStyle} placeholder="Şifre Tekrar" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                    {confirmPassword.length > 0 && (
                        <TouchableOpacity style={styles.clearBtn} onPress={() => setConfirmPassword('')}>
                            <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && { opacity: 0.7 }]}
                    onPress={handleRegister}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>KOD GÖNDER</Text>}
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.loginHint} onPress={() => router.replace('/login')}>
                <Text style={styles.loginHintText}>Zaten bir hesabınız var mı? <Text style={styles.loginHintBold}>Giriş Yap</Text></Text>
            </TouchableOpacity>
        </View>
    );

    const renderStep2 = () => (
        <View style={styles.content}>
            <Text style={styles.title}>Doğrulama</Text>
            <Text style={styles.sub}>{email} adresine gönderilen 6 haneli kodu giriniz.</Text>

            <View style={[styles.form, { marginTop: 20 }]}>
                <TextInput placeholderTextColor="#64748b"
                    style={[styles.inputStyle, styles.codeInput, timer === 0 && styles.disabledInput]}
                    placeholder="000000"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={timer > 0}
                />
                {timer > 0 ? (
                    <Text style={styles.timerText}>{timer}s</Text>
                ) : (
                    <TouchableOpacity onPress={handleResendCode}>
                        <Text style={styles.resendText}>Yeniden Gönder</Text>
                    </TouchableOpacity>
                )}
            </View>

            <TouchableOpacity
                style={[styles.button, (loading || timer === 0) && { opacity: 0.7 }]}
                onPress={handleVerifyActivation}
                disabled={loading || timer === 0}
            >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>HESABI AKTİVE ET</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backToStep1} onPress={() => setStep(1)}>
                <Text style={styles.backToStep1Text}>Bilgileri Düzenle</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.backBtn} onPress={() => step === 1 ? router.back() : setStep(1)}>
                    <Ionicons name="arrow-back" size={24} color="#1e293b" />
                </TouchableOpacity>

                {step === 1 ? renderStep1() : renderStep2()}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    scrollContent: { flexGrow: 1, padding: 25 },
    backBtn: { marginTop: 20, marginBottom: 10, alignSelf: 'flex-start' },
    content: { flex: 1 },
    title: { fontSize: 32, fontWeight: '900', color: '#333' },
    sub: { fontSize: 16, color: '#64748b', marginBottom: 20, marginTop: 5 },
    roleContainer: { marginBottom: 25 },
    roleLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', marginBottom: 10, letterSpacing: 1 },
    segmentContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 4 },
    segment: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
    segmentActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    segmentText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    segmentTextActive: { color: '#6366f1' },
    roleInfo: { fontSize: 13, color: '#64748b', marginTop: 10, fontStyle: 'italic', paddingHorizontal: 5 },
    form: { gap: 15 },
    inputContainer: { position: 'relative' },
    inputStyle: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 18, paddingRight: 45, fontSize: 16, color: '#333' },
    clearBtn: { position: 'absolute', right: 15, top: 18 },
    highlightInput: { borderColor: '#6366f1', backgroundColor: '#f5f3ff' },
    codeInputContainer: { position: 'relative', justifyContent: 'center' },
    codeInput: { textAlign: 'center', fontSize: 24, fontWeight: 'bold', letterSpacing: 8 },
    disabledInput: { backgroundColor: '#f1f5f9', color: '#94a3b8' },
    timerText: { position: 'absolute', right: 20, color: '#6366f1', fontWeight: 'bold' },
    resendText: { position: 'absolute', right: 20, top: -20, color: '#6366f1', fontWeight: 'bold', textDecorationLine: 'underline' },
    button: { backgroundColor: '#6366f1', height: 65, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    buttonText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
    loginHint: { marginTop: 30, marginBottom: 20, alignItems: 'center' },
    loginHintText: { color: '#64748b', fontSize: 14 },
    loginHintBold: { color: '#6366f1', fontWeight: 'bold' },
    backToStep1: { marginTop: 15, alignItems: 'center' },
    backToStep1Text: { color: '#64748b', fontSize: 14, textDecorationLine: 'underline' }
});
