import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Platform, Alert } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';

// Gesture handler modüllerini ekliyoruz
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

const formatDate = (dateStr: string) => {
    try {
        if (!dateStr) return "-";
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
};

export default function NotificationsScreen() {
    const router = useRouter();
    const { showAlert } = useAlert();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Seçim durumu state'leri
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Swipeable referansları için
    let row: Array<any> = [];

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async (isRefreshing = false) => {
        if (!isRefreshing) setLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/System/notifications`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotifications(res.data);

            // Ekrana girilince okunmamış bildirimler varsa hepsini okundu yap
            const hasUnread = res.data.some((n: any) => !n.isRead);
            if (hasUnread) {
                await axios.post(`${API_URL}/System/notifications/read-all`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                // Lokal state'i de güncelle
                setNotifications(res.data.map((n: any) => ({ ...n, isRead: true })));
            }
        } catch (error) {
            console.log("Bildirim yükleme hatası", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleMarkAsRead = async (id: number) => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/System/notifications/read/${id}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        } catch (error) {
            console.log("Bildirim okundu işaretleme hatası", error);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.delete(`${API_URL}/System/notifications/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotifications(prev => prev.filter(n => n.id !== id));
            showAlert({ title: "Başarılı", message: "Bildirim silindi.", type: "success" });
        } catch (error) {
            console.log("Silme hatası", error);
            showAlert({ title: "Hata", message: "Silinemedi.", type: "error" });
        }
    };

    const handleBulkDelete = () => {
        if (selectedIds.length === 0) return;

        showAlert({
            title: "Uyarı",
            message: `Seçili ${selectedIds.length} bildirimi silmek istiyor musunuz?`,
            type: 'confirm',
            showCancel: true,
            confirmText: "Evet, Sil",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    await axios.post(`${API_URL}/System/notifications/delete-bulk`, selectedIds, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    setNotifications(prev => prev.filter(n => !selectedIds.includes(n.id)));
                    setSelectionMode(false);
                    setSelectedIds([]);
                    showAlert({ title: "Başarılı", message: "Seçilenler silindi.", type: "success" });
                } catch (error) {
                    console.log("Toplu silme hatası", error);
                    showAlert({ title: "Hata", message: "Bir hata oluştu.", type: "error" });
                }
            }
        });
    };

    const handleMarkAllAsRead = async () => {
        const unreadExists = notifications.some(n => !n.isRead);
        if (!unreadExists) return;

        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/System/notifications/read-all`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            showAlert({ title: "Başarılı", message: "Tüm bildirimler okundu olarak işaretlendi.", type: "success" });
        } catch (error) {
            console.log("Tümünü okundu işaretleme hatası", error);
            showAlert({ title: "Hata", message: "Bildirimler işaretlenemedi.", type: "error" });
        }
    };

    const handleNotificationPress = (item: any) => {
        if (selectionMode) {
            toggleSelection(item.id);
            return;
        }

        if (!item.isRead) {
            handleMarkAsRead(item.id);
        }
        showAlert({ title: item.title, message: item.detail, type: 'info' });
    };

    const handleLongPress = (item: any) => {
        if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds([item.id]);
        }
    };

    const toggleSelection = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === notifications.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(notifications.map(n => n.id));
        }
    };

    // Swipeable için sağ aksiyon rendering
    const renderRightActions = (id: number) => {
        return (
            <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => handleDelete(id)}>
                <Ionicons name="trash-outline" size={24} color="#fff" />
                <Text style={styles.swipeDeleteText}>Sil</Text>
            </TouchableOpacity>
        );
    };

    const renderItem = ({ item, index }: any) => {
        const isSelected = selectedIds.includes(item.id);

        return (
            <Swipeable
                key={item.id}
                ref={ref => { row[index] = ref; }}
                enabled={!selectionMode}
                renderRightActions={() => renderRightActions(item.id)}
                onSwipeableWillOpen={() => {
                    row.forEach((r, i) => { if (i !== index && r) r.close(); });
                }}
            >
                <TouchableOpacity
                    style={[
                        styles.card,
                        !item.isRead && styles.unreadCard,
                        isSelected && styles.selectedCard
                    ]}
                    onPress={() => handleNotificationPress(item)}
                    onLongPress={() => handleLongPress(item)}
                    activeOpacity={0.8}
                >
                    {selectionMode && (
                        <View style={styles.checkboxContainer}>
                            <Ionicons
                                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                                size={26}
                                color={isSelected ? "#0d6efd" : "#ccc"}
                            />
                        </View>
                    )}

                    <View style={styles.iconContainer}>
                        <Ionicons
                            name={item.isRead ? "notifications-off-circle" : "notifications"}
                            size={28}
                            color={item.isRead ? "#adb5bd" : "#0d6efd"}
                        />
                    </View>
                    <View style={styles.cardContent}>
                        <View style={styles.headerRow}>
                            <Text style={[styles.title, !item.isRead && styles.unreadText]} numberOfLines={1}>
                                {item.title}
                            </Text>
                            {!item.isRead && !selectionMode && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.detail} numberOfLines={2}>{item.detail}</Text>
                        <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    return (
        <GestureHandlerRootView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {selectionMode ? (
                <View style={[styles.header, styles.selectionHeader]}>
                    <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds([]); }} style={styles.backBtn}>
                        <Text style={styles.cancelText}>İptal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleSelectAll} style={styles.middleAction}>
                        <Ionicons name={selectedIds.length === notifications.length ? "list-outline" : "list"} size={22} color="#0d6efd" />
                        <Text style={styles.selectAllText}>{selectedIds.length === notifications.length ? "Tümünü Çıkar" : "Tümünü Seç"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handleBulkDelete}
                        style={styles.markAllBtn}
                        disabled={selectedIds.length === 0}
                    >
                        <Ionicons name="trash" size={24} color={selectedIds.length > 0 ? "#dc3545" : "#ffc107"} />
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#212529" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Bildirimler</Text>
                    <View style={{ width: 34 }} />
                </View>
            )}

            {loading && !refreshing ? (
                <ActivityIndicator size="large" color="#0d6efd" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => fetchNotifications(true)} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="notifications-off-outline" size={80} color="#dee2e6" />
                            <Text style={styles.emptyTitle}>Bildirim Yok</Text>
                            <Text style={styles.emptySub}>Henüz hiç bildirim almadınız.</Text>
                        </View>
                    }
                />
            )}
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 50,
        paddingBottom: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 3
    },
    backBtn: { padding: 5, marginLeft: -5 },
    markAllBtn: { padding: 5, marginRight: -5 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#212529' },

    listContainer: { padding: 15, paddingBottom: 40 },
    card: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 15,
        marginBottom: 12,
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 3,
        borderWidth: 1,
        borderColor: 'transparent'
    },
    unreadCard: {
        backgroundColor: '#f0f7ff',
        borderColor: '#cce5ff'
    },
    iconContainer: {
        marginRight: 15,
        justifyContent: 'center',
        alignItems: 'center'
    },
    cardContent: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4
    },
    title: {
        fontSize: 15,
        color: '#495057',
        fontWeight: '600',
        flex: 1
    },
    unreadText: {
        fontWeight: '800',
        color: '#212529'
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0d6efd',
        marginLeft: 10
    },
    detail: {
        fontSize: 13,
        color: '#6c757d',
        marginBottom: 8,
        lineHeight: 18
    },
    date: {
        fontSize: 11,
        color: '#adb5bd'
    },

    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#495057', marginTop: 20 },
    emptySub: { fontSize: 14, color: '#6c757d', textAlign: 'center', marginTop: 10 },

    // YENİ EKLENEN STİLLER
    selectionHeader: {
        backgroundColor: '#f8f9fa'
    },
    cancelText: {
        fontSize: 16,
        color: '#dc3545',
        fontWeight: '600'
    },
    middleAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    selectAllText: {
        fontSize: 15,
        color: '#0d6efd',
        fontWeight: '500'
    },
    selectedCard: {
        backgroundColor: '#e6f2ff',
        borderColor: '#99ccff'
    },
    checkboxContainer: {
        marginRight: 10,
        justifyContent: 'center'
    },
    swipeDeleteBtn: {
        backgroundColor: '#dc3545',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        borderRadius: 12,
        marginBottom: 12,
        marginRight: 2
    },
    swipeDeleteText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
        marginTop: 4
    },
});
