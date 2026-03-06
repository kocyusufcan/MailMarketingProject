import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/Config';

export default function ActivityScreen() {
    const router = useRouter();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchLogs(); }, []);

    const fetchLogs = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Reports/activity`, { headers: { Authorization: `Bearer ${token}` } });
            setLogs(res.data);
        } catch (e) {
            console.error("Loglar yüklenemedi", e);
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: any) => (
        <View style={styles.logCard}>
            <View style={styles.logIconBox}>
                <Ionicons
                    name={getIcon(item.actionTitle)}
                    size={20}
                    color="#6366f1"
                />
            </View>
            <View style={styles.logContent}>
                <Text style={styles.logTitle}>{item.actionTitle}</Text>
                <Text style={styles.logDetail}>{item.actionDetail}</Text>
                <Text style={styles.logDate}>{new Date(item.createdAt).toLocaleString('tr-TR')}</Text>
            </View>
        </View>
    );

    const getIcon = (title: string) => {
        if (title.includes("Silindi")) return "trash-outline";
        if (title.includes("Eklendi")) return "add-circle-outline";
        if (title.includes("Güncellendi")) return "refresh-outline";
        return "flash-outline";
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#1e293b" /></TouchableOpacity>
                <Text style={styles.headerTitle}>İşlem Geçmişi</Text>
                <TouchableOpacity onPress={fetchLogs}><Ionicons name="sync" size={24} color="#6366f1" /></TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 50 }} /> : (
                <FlatList
                    data={logs}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 25 }}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="list-outline" size={60} color="#cbd5e1" />
                            <Text style={styles.emptyText}>Henüz bir kayıt bulunmuyor.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 25, paddingTop: Platform.OS === 'ios' ? 60 : 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#333' },
    logCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#f1f5f9' },
    logIconBox: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    logContent: { flex: 1 },
    logTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    logDetail: { fontSize: 13, color: '#64748b', marginTop: 4 },
    logDate: { fontSize: 11, color: '#94a3b8', marginTop: 8, fontWeight: '600' },
    emptyContainer: { alignItems: 'center', marginTop: 100 },
    emptyText: { color: '#94a3b8', marginTop: 15, fontSize: 15 }
});
