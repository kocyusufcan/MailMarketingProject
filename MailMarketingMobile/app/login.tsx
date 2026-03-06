import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const router = useRouter();

    const { showAlert } = useAlert();

    const handleLogin = async () => {
        if (!email || !password) {
            showAlert({ title: "Eksik Bilgi", message: "Lütfen e-posta ve şifrenizi girin.", type: 'warning' });
            return;
        }
        try {
            const platform = Platform.OS === 'web' ? 'Web Sitesi' : 'Mobil Uygulama';
            const response = await axios.post(`${API_URL}/Auth/login`, { email, password, platform });
            if (response.data.token) {
                const userToken = response.data.token;
                const user = response.data.user;
                if (Platform.OS === 'web') {
                    localStorage.setItem('userToken', userToken);
                    localStorage.setItem('user', JSON.stringify(user));
                } else {
                    await SecureStore.setItemAsync('userToken', userToken);
                    await SecureStore.setItemAsync('user', JSON.stringify(user));
                }
                router.replace('/(tabs)');
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.";
            showAlert({ title: "Giriş Hatası", message: errorMsg, type: 'error' });
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.loginCard}>
                    {/* 🎯 Orijinal Logo Görseli */}
                    <View style={styles.logoWrapper}>
                        <Image
                            source={require('../assets/images/icon.png')}
                            style={styles.logoImage}
                            resizeMode="contain"
                        />
                    </View>

                    <Text style={styles.loginMainTitle}>MailMarketingMobile</Text>
                    <Text style={styles.loginSub}>Hesabınıza güvenle giriş yapın.</Text>

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
                        <TextInput placeholderTextColor="#64748b"
                            style={styles.inputStyle}
                            placeholder="Şifre"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                        {password.length > 0 && (
                            <TouchableOpacity style={styles.clearBtn} onPress={() => setPassword('')}>
                                <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity style={styles.loginActionBtn} onPress={handleLogin}>
                        <Text style={styles.loginActionText}>DEVAM ET</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </TouchableOpacity>

                    <View style={styles.footerLinks}>
                        <TouchableOpacity onPress={() => router.push('/forgot-password')}>
                            <Text style={styles.footerLinkText}>Şifremi Unuttum</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/register')}>
                            <Text style={styles.footerLinkText}>Kayıt Ol</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    scrollContent: { flexGrow: 1, justifyContent: 'center' },
    loginCard: { padding: 30, paddingBottom: 50 },

    // Logo Stilleri
    logoWrapper: { alignItems: 'center', marginBottom: 25 },
    logoImage: {
        width: 140,
        height: 140,
    },

    loginMainTitle: { fontSize: 32, fontWeight: '900', color: '#333', textAlign: 'center' },
    loginSub: { fontSize: 15, color: '#64748b', marginBottom: 40, marginTop: 8, textAlign: 'center' },
    inputContainer: { position: 'relative', marginBottom: 15 },
    inputStyle: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 18, paddingRight: 50, fontSize: 16, color: '#333' },
    clearBtn: { position: 'absolute', right: 15, top: 18 },
    loginActionBtn: { backgroundColor: '#333', height: 65, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 },
    loginActionText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
    footerLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, paddingHorizontal: 5 },
    footerLinkText: { color: '#6366f1', fontWeight: '600', fontSize: 14 }
});
