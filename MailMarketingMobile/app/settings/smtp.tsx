import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, Switch } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function SmtpSettingsScreen() {
    // Backend (Setting.cs) ile tam uyumlu alan isimleri
    const [config, setConfig] = useState({ mailServer: '', port: '', email: '', password: '', enableSSL: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { showAlert } = useAlert();
    const router = useRouter();

    useEffect(() => { loadSettings(); }, []);

    const loadSettings = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Settings/smtp`, { headers: { Authorization: `Bearer ${token}` } });

            if (res.data) {
                // API'den gelen veriyi (PascalCase veya camelCase) karşılayacak şekilde eşleştiriyoruz
                setConfig({
                    mailServer: res.data.mailServer || res.data.MailServer || '',
                    port: (res.data.port || res.data.Port || '').toString(),
                    email: res.data.email || res.data.Email || '',
                    password: res.data.password || res.data.Password || '',
                    enableSSL: res.data.enableSSL !== undefined ? res.data.enableSSL : (res.data.EnableSSL !== undefined ? res.data.EnableSSL : true)
                });
            }
        } catch (error: any) {
            console.error("SMTP Ayarları Yükleme Hatası:", error);
            if (error.response?.status === 401) {
                showAlert({ title: "Oturum Kapandı", message: "Lütfen tekrar giriş yapın.", type: 'warning' });
            } else if (error.response?.status !== 404) {
                const msg = error.response?.data?.message || "Ayarlar alınırken hata oluştu.";
                showAlert({ title: "Hata", message: msg, type: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!config.mailServer || !config.port || !config.email) {
            showAlert({ title: "Uyarı", message: "Lütfen tüm zorunlu alanları doldurun.", type: 'warning' });
            return;
        }

        setSaving(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');

            const payload = {
                mailServer: config.mailServer,
                port: parseInt(config.port),
                email: config.email,
                password: config.password,
                enableSSL: config.enableSSL
            };

            await axios.post(`${API_URL}/Settings/smtp`, payload, { headers: { Authorization: `Bearer ${token}` } });
            showAlert({ title: "Başarılı", message: "SMTP ayarları güncellendi!", type: 'success' });
            router.back();
        } catch (error: any) {
            console.error("SMTP Ayarları Kaydetme Hatası:", error);
            const msg = error.response?.data?.message || "Ayarlar kaydedilemedi.";
            Alert.alert("Hata", msg);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0d6efd" /></View>;

    return (
        <ScrollView style={styles.container}>
            {/* Native header'ı gizliyoruz */}
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#212529" /></TouchableOpacity>
                <Text style={styles.title}>SMTP Ayarlarım</Text>
            </View>

            <View style={styles.form}>
                <Text style={styles.label}>SMTP Host (Örn: smtp.gmail.com)</Text>
                <TextInput placeholderTextColor="#64748b" style={styles.input} value={config.mailServer} onChangeText={(t) => setConfig({ ...config, mailServer: t })} placeholder="smtp.gmail.com" />

                <Text style={styles.label}>Port (Örn: 587)</Text>
                <TextInput placeholderTextColor="#64748b" style={styles.input} value={config.port} onChangeText={(t) => setConfig({ ...config, port: t })} keyboardType="numeric" placeholder="587" />

                <Text style={styles.label}>E-Posta Adresi</Text>
                <TextInput placeholderTextColor="#64748b" style={styles.input} value={config.email} onChangeText={(t) => setConfig({ ...config, email: t })} autoCapitalize="none" placeholder="adiniz@gmail.com" />

                <Text style={styles.label}>Uygulama Şifresi</Text>
                <View style={styles.passwordContainer}>
                    <TextInput placeholderTextColor="#64748b"
                        style={[styles.input, { flex: 1, marginBottom: 0, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                        value={config.password}
                        onChangeText={(t) => setConfig({ ...config, password: t })}
                        secureTextEntry={!showPassword}
                        placeholder="****"
                    />
                    <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="#6c757d" />
                    </TouchableOpacity>
                </View>

                <View style={styles.switchRow}>
                    <Text style={[styles.label, { marginBottom: 0 }]}>SSL Kullan</Text>
                    <Switch value={config.enableSSL} onValueChange={(v) => setConfig({ ...config, enableSSL: v })} trackColor={{ false: "#dee2e6", true: "#0d6efd" }} />
                </View>

                <TouchableOpacity style={[styles.btn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>AYARLARI KAYDET</Text>}
                </TouchableOpacity>

                <Text style={styles.infoText}>* Web sürümünde yaptığınız ayarlar burada otomatik görünür.</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    title: { fontSize: 20, fontWeight: 'bold', marginLeft: 15, color: '#212529' },
    form: { padding: 20 },
    label: { fontSize: 13, color: '#6c757d', marginBottom: 8, fontWeight: 'bold' },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dee2e6', borderRadius: 10, padding: 15, marginBottom: 20, fontSize: 16 },
    passwordContainer: { flexDirection: 'row', marginBottom: 20 },
    eyeBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dee2e6', borderLeftWidth: 0, borderTopRightRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 15, justifyContent: 'center' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#dee2e6' },
    btn: { backgroundColor: '#0d6efd', padding: 18, borderRadius: 12, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    infoText: { marginTop: 20, textAlign: 'center', color: '#6c757d', fontSize: 12, fontStyle: 'italic' }
});
