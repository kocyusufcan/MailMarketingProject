import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, Platform, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

export default function SubscriberListScreen() {
    const { id, title } = useLocalSearchParams();
    const router = useRouter();
    const [subscribers, setSubscribers] = useState([]);
    const [loading, setLoading] = useState(true);
    const { showAlert } = useAlert();

    const [modalVisible, setModalVisible] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => { fetchSubscribers(); }, []);

    const fetchSubscribers = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const response = await axios.get(`${API_URL}/Subscribers/group/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSubscribers(response.data);
        } catch (error) {
            console.error("Aboneler çekilemedi:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (subscriberId: number) => {
        showAlert({
            title: "Abone Sil",
            message: "Bu kişiyi bu listeden kaldırmak istediğinize emin misiniz?",
            type: 'confirm',
            showCancel: true,
            confirmText: "Sil",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    await axios.delete(`${API_URL}/Subscribers/delete/${subscriberId}`, { headers: { Authorization: `Bearer ${token}` } });
                    fetchSubscribers();
                } catch (error) { showAlert({ title: "Hata", message: "Silme işlemi başarısız.", type: 'error' }); }
            }
        });
    };

    const handleAddSubscriber = async () => {
        if (!firstName || !email) { showAlert({ title: "Uyarı", message: "Ad ve E-posta zorunludur.", type: 'warning' }); return; }
        setAdding(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/Subscribers/add/${id}`, { firstName, lastName, email, isActive: true }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setModalVisible(false);
            setFirstName(''); setLastName(''); setEmail('');
            fetchSubscribers();
        } catch (error) { showAlert({ title: "Hata", message: "Abone eklenemedi.", type: 'error' }); }
        finally { setAdding(false); }
    };

    const renderItem = ({ item }: any) => (
        <View style={styles.card}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.firstName?.[0] || "A"}</Text>
            </View>
            <View style={styles.info}>
                <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.email}>{item.email}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={20} color="#dc3545" />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#212529" /></TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{title || "Grup Aboneleri"}</Text>
                <TouchableOpacity onPress={() => setModalVisible(true)}><Ionicons name="person-add" size={24} color="#0d6efd" /></TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator size="large" color="#0d6efd" style={{ marginTop: 50 }} /> : (
                <FlatList
                    data={subscribers}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 20 }}
                    ListEmptyComponent={<Text style={styles.emptyText}>Bu grupta henüz abone yok.</Text>}
                />
            )}

            <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setModalVisible(false)}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={styles.modalView}
                        onPress={() => { }}
                    >
                        <Text style={styles.modalTitle}>Gruba Abone Ekle</Text>
                        <TextInput placeholderTextColor="#64748b" style={styles.input} placeholder="Ad" value={firstName} onChangeText={setFirstName} />
                        <TextInput placeholderTextColor="#64748b" style={styles.input} placeholder="Soyad" value={lastName} onChangeText={setLastName} />
                        <TextInput placeholderTextColor="#64748b" style={styles.input} placeholder="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#6c757d' }]} onPress={() => setModalVisible(false)}><Text style={styles.buttonText}>Vazgeç</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#0d6efd' }]} onPress={handleAddSubscriber} disabled={adding}>
                                {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Kaydet</Text>}
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#212529', flex: 1, marginHorizontal: 15 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05 },
    avatar: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#e7f0ff', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#0d6efd', fontWeight: 'bold', fontSize: 18 },
    info: { flex: 1, marginLeft: 15 },
    name: { fontSize: 16, fontWeight: '600', color: '#212529' },
    email: { fontSize: 13, color: '#6c757d', marginTop: 2 },
    deleteBtn: { padding: 8 },
    emptyText: { textAlign: 'center', marginTop: 80, color: '#adb5bd' },
    modalOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
    modalView: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 25, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    input: { width: '100%', height: 50, borderBottomWidth: 1, borderBottomColor: '#dee2e6', marginBottom: 20, fontSize: 16 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    modalButton: { flex: 0.45, height: 45, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
