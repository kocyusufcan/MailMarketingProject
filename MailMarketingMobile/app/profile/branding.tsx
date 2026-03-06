import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Platform, ActivityIndicator, ScrollView, Switch } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function BrandingScreen() {
    const { showAlert } = useAlert();
    const router = useRouter();
    const [profile, setProfile] = useState({ displayName: '', isPublic: false, adminInvitationCode: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => { fetchProfile(); }, []);

    const fetchProfile = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Auth/profile`, { headers: { Authorization: `Bearer ${token}` } });
            setProfile(res.data);
        } catch (e) {
            showAlert({ title: "Hata", message: "Profil bilgileri alınamadı.", type: 'error' });
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.put(`${API_URL}/Auth/branding`, {
                displayName: profile.displayName,
                isPublic: profile.isPublic
            }, { headers: { Authorization: `Bearer ${token}` } });

            showAlert({ title: "Başarılı", message: "Marka ayarlarınız güncellendi.", type: 'success' });
        } catch (e) {
            showAlert({ title: "Hata", message: "Ayarlar kaydedilemedi.", type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const copyCode = async () => {
        if (profile.adminInvitationCode) {
            await Clipboard.setStringAsync(profile.adminInvitationCode);
            showAlert({
                title: "Kopyalandı",
                message: "Davet kodu başarıyla panoya kopyalandı!",
                type: 'success'
            });
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;

    return (
        <ScrollView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#1e293b" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Marka & Görünürlük</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#6366f1" /> : <Ionicons name="checkmark-done" size={26} color="#6366f1" />}
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.label}>DAVET KODUNUZ</Text>
                    <View style={styles.inviteBox}>
                        <Text style={styles.codeText}>{profile.adminInvitationCode || "---"}</Text>
                        <TouchableOpacity style={styles.copyBtn} onPress={copyCode}>
                            <Ionicons name="copy-outline" size={18} color="#6366f1" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.hint}>Bu kod ile diğer kullanıcılar sizin alt hesabınız olarak sisteme kayıt olabilir.</Text>
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>STÜDYO / MAĞAZA ADI</Text>
                    <TextInput placeholderTextColor="#64748b"
                        style={styles.input}
                        value={profile.displayName}
                        onChangeText={(t) => setProfile({ ...profile, displayName: t })}
                        placeholder="Örn: Yusuf Can Marketing"
                    />
                </View>

                <View style={styles.card}>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardMainLabel}>Bülten Görünürlüğü</Text>
                            <Text style={styles.cardSubLabel}>Profiliniz diğer kullanıcılar tarafından görülebilsin mi?</Text>
                        </View>
                        <Switch
                            value={profile.isPublic}
                            onValueChange={(v) => setProfile({ ...profile, isPublic: v })}
                            trackColor={{ false: "#e2e8f0", true: "#c7d2fe" }}
                            thumbColor={profile.isPublic ? "#6366f1" : "#f1f5f9"}
                        />
                    </View>
                </View>

                <TouchableOpacity style={[styles.mainBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>AYARLARI KAYDET</Text>}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#333' },
    content: { padding: 25 },
    card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9' },
    label: { fontSize: 11, fontWeight: '800', color: '#94a3b8', marginBottom: 10, letterSpacing: 1 },
    inviteBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' },
    codeText: { fontSize: 18, fontWeight: 'bold', color: '#475569', letterSpacing: 2 },
    copyBtn: { backgroundColor: '#fff', padding: 8, borderRadius: 8, elevation: 1 },
    hint: { fontSize: 12, color: '#94a3b8', marginTop: 10, lineHeight: 18 },
    formGroup: { marginBottom: 20 },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 18, fontSize: 16, color: '#333' },
    row: { flexDirection: 'row', alignItems: 'center' },
    cardMainLabel: { fontSize: 15, fontWeight: '700', color: '#333' },
    cardSubLabel: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
    mainBtn: { backgroundColor: '#6366f1', height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#6366f1', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
    mainBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 }
});
