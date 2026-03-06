import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function NewTemplateScreen() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);
    const { showAlert } = useAlert();
    const router = useRouter();

    const handleSave = async () => {
        if (!title.trim() || !content.trim()) {
            showAlert({ title: "Uyarı", message: "Lütfen tüm alanları doldurun.", type: 'warning' });
            return;
        }

        setSaving(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/Templates`, {
                title: title,
                content: content
            }, { headers: { Authorization: `Bearer ${token}` } });

            showAlert({ title: "Başarılı", message: "Şablon başarıyla oluşturuldu.", type: 'success' });
            router.back();
        } catch (e) {
            showAlert({ title: "Hata", message: "Şablon kaydedilemedi.", type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#212529" /></TouchableOpacity>
                <Text style={styles.title}>Yeni Şablon Oluştur</Text>
            </View>

            <View style={styles.form}>
                <Text style={styles.label}>Şablon Başlığı</Text>
                <TextInput placeholderTextColor="#64748b"
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Örn: Hoş Geldin Mesajı"
                />

                <Text style={styles.label}>Şablon İçeriği (HTML veya Metin)</Text>
                <TextInput placeholderTextColor="#64748b"
                    style={[styles.input, styles.textArea]}
                    value={content}
                    onChangeText={setContent}
                    placeholder="E-posta içeriğini buraya yazın..."
                    multiline
                    numberOfLines={10}
                    textAlignVertical="top"
                />

                <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ŞABLONU KAYDET</Text>}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    title: { fontSize: 20, fontWeight: 'bold', marginLeft: 15, color: '#212529' },
    form: { padding: 20 },
    label: { fontSize: 13, color: '#6c757d', marginBottom: 8, fontWeight: 'bold' },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dee2e6', borderRadius: 10, padding: 15, marginBottom: 20, fontSize: 16 },
    textArea: { height: 250, paddingBottom: 15 },
    btn: { backgroundColor: '#0d6efd', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
