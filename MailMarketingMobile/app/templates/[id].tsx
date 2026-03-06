import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Platform, ActivityIndicator, ScrollView } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function EditTemplateScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [template, setTemplate] = useState({ title: '', content: '', isActive: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { showAlert } = useAlert();

    useEffect(() => { fetchTemplate(); }, []);

    const fetchTemplate = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Templates/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            setTemplate(res.data);
        } catch (e) {
            showAlert({ title: "Hata", message: "Şablon bilgileri yüklenemedi.", type: 'error' });
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!template.title.trim() || !template.content.trim()) {
            showAlert({ title: "Uyarı", message: "Lütfen tüm alanları doldurun.", type: 'warning' });
            return;
        }

        setSaving(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.put(`${API_URL}/Templates/${id}`, template, { headers: { Authorization: `Bearer ${token}` } });
            showAlert({ title: "Başarılı", message: "Şablon güncellendi.", type: 'success' });
            router.back();
        } catch (e) {
            showAlert({ title: "Hata", message: "Şablon güncellenemedi.", type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0d6efd" /></View>;

    return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#212529" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Şablonu Düzenle</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#0d6efd" /> : <Ionicons name="save" size={24} color="#0d6efd" />}
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <Text style={styles.label}>ŞABLON ADI</Text>
                <TextInput placeholderTextColor="#64748b"
                    style={styles.input}
                    value={template.title}
                    onChangeText={(t) => setTemplate({ ...template, title: t })}
                    placeholder="Örn: Hoş Geldin Mesajı"
                />

                <Text style={styles.label}>İÇERİK (HTML ŞABLONU)</Text>
                <TextInput placeholderTextColor="#64748b"
                    style={[styles.input, styles.textArea]}
                    value={template.content}
                    onChangeText={(t) => setTemplate({ ...template, content: t })}
                    placeholder="Mail içeriğini buraya yazın..."
                    multiline
                />

                <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => setTemplate({ ...template, isActive: !template.isActive })}
                >
                    <Ionicons
                        name={template.isActive ? "checkbox" : "square-outline"}
                        size={24}
                        color={template.isActive ? "#0d6efd" : "#ccc"}
                    />
                    <Text style={styles.toggleText}>Bu şablon aktif olarak kullanılsın</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.saveButton, saving && { opacity: 0.7 }]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? <ActivityIndicator color="#fff" /> : (
                        <>
                            <Text style={styles.saveButtonText}>DEĞİŞİKLİKLERİ KAYDET</Text>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginLeft: 10 }} />
                        </>
                    )}
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
    content: { padding: 20 },
    label: { fontSize: 13, fontWeight: 'bold', color: '#adb5bd', marginBottom: 10, marginTop: 10 },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dee2e6', borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 20 },
    textArea: { height: 250, textAlignVertical: 'top' },
    toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
    toggleText: { marginLeft: 10, fontSize: 16, color: '#495057' },
    saveButton: { backgroundColor: '#0d6efd', height: 60, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', elevation: 3 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
