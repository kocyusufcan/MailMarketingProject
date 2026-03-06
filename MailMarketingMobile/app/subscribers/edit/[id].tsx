import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Platform, ActivityIndicator, ScrollView } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function EditSubscriberScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [subscriber, setSubscriber] = useState({ firstName: '', lastName: '', email: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { showAlert } = useAlert();

    useEffect(() => { fetchSubscriber(); }, []);

    const fetchSubscriber = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            // Not: API'de tek abone çekme GetById yokmuş, GetStats içinden veya all listesinden çekilebilir.
            // Ama standart olarak bir GetById endpoint'i iyi olurdu. 
            // Şimdilik listeyi filtreleyerek bulalım veya API'ye GetById ekleyelim.
            // SubscribersController'da GetById yok. Hemen ekleyelim.
            const res = await axios.get(`${API_URL}/Subscribers/all`, { headers: { Authorization: `Bearer ${token}` } });
            const found = res.data.find((s: any) => s.id == id);
            if (found) {
                setSubscriber(found);
            } else {
                showAlert({ title: "Hata", message: "Abone bulunamadı.", type: 'error' });
                router.back();
            }
        } catch (e) {
            showAlert({ title: "Hata", message: "Abone bilgileri alınamadı.", type: 'error' });
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const validateEmail = (email: string) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    };

    const handleUpdate = async () => {
        if (!subscriber.firstName || !subscriber.email) {
            showAlert({ title: "Uyarı", message: "Ad ve E-posta zorunludur.", type: 'warning' });
            return;
        }

        if (!validateEmail(subscriber.email)) {
            showAlert({ title: "Uyarı", message: "Lütfen geçerli bir e-posta adresi girin.", type: 'warning' });
            return;
        }
        setSaving(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.put(`${API_URL}/Subscribers/update/${id}`, subscriber, { headers: { Authorization: `Bearer ${token}` } });
            showAlert({ title: "Başarılı", message: "Abone bilgileri güncellendi.", type: 'success' });
            router.back();
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || "Güncelleme yapılamadı.";
            showAlert({ title: "Hata", message: errorMsg, type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0d6efd" /></View>;

    return (
        <ScrollView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#212529" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Abone Düzenle</Text>
                <TouchableOpacity onPress={handleUpdate} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#0d6efd" /> : <Ionicons name="checkmark-done" size={26} color="#0d6efd" />}
                </TouchableOpacity>
            </View>

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>AD</Text>
                    <TextInput placeholderTextColor="#64748b" style={styles.input} value={subscriber.firstName} onChangeText={(t) => setSubscriber({ ...subscriber, firstName: t })} placeholder="Adı girin" />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>SOYAD</Text>
                    <TextInput placeholderTextColor="#64748b" style={styles.input} value={subscriber.lastName} onChangeText={(t) => setSubscriber({ ...subscriber, lastName: t })} placeholder="Soyadı girin" />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>E-POSTA ADRESİ</Text>
                    <TextInput placeholderTextColor="#64748b" style={styles.input} value={subscriber.email} onChangeText={(t) => setSubscriber({ ...subscriber, email: t })} placeholder="Email adresi" keyboardType="email-address" autoCapitalize="none" />
                </View>

                <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.7 }]} onPress={handleUpdate} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>BİLGİLERİ GÜNCELLE</Text>}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#212529' },
    form: { padding: 25 },
    inputGroup: { marginBottom: 20 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#adb5bd', marginBottom: 8, marginLeft: 5 },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dee2e6', borderRadius: 12, padding: 15, fontSize: 16 },
    submitBtn: { backgroundColor: '#0d6efd', height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 20, shadowColor: '#0d6efd', shadowOpacity: 0.3, shadowRadius: 10, elevation: 3 },
    submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
