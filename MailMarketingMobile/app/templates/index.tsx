import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, Platform, TouchableOpacity, BackHandler, TextInput } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';
import { Swipeable } from 'react-native-gesture-handler';

export default function TemplatesScreen() {
    const [templates, setTemplates] = useState([]);
    const [filteredTemplates, setFilteredTemplates] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [statusFilter, setStatusFilter] = useState('All'); // All, Active, Passive
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showAlert } = useAlert();
    const swipeableRefs = useRef<{ [key: number]: Swipeable | null }>({});
    const router = useRouter();

    useFocusEffect(
        React.useCallback(() => {
            fetchTemplates();

            const onBackPress = () => {
                if (selectionMode) {
                    cancelSelection();
                    return true;
                }
                return false;
            };

            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => {
                if (subscription && typeof subscription.remove === 'function') {
                    subscription.remove();
                } else if (BackHandler && typeof (BackHandler as any).removeEventListener === 'function') {
                    (BackHandler as any).removeEventListener('hardwareBackPress', onBackPress);
                }
            };
        }, [selectionMode, search, statusFilter])
    );

    const fetchTemplates = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Templates`, { headers: { Authorization: `Bearer ${token}` } });
            setTemplates(res.data);
            applySearch(search, statusFilter, res.data);
        } catch (e) {
            console.error("Şablonlar yüklenemedi", e);
        } finally {
            setLoading(false);
        }
    };

    const applySearch = (text: string, status = statusFilter, data = templates) => {
        const sourceData = Array.isArray(data) ? data : [];
        let filtered = sourceData;

        if (text) {
            filtered = filtered.filter((t: any) =>
                (t.title || "").toLowerCase().includes(text.toLowerCase())
            );
        }

        if (status !== 'All') {
            const isActive = status === 'Active';
            filtered = filtered.filter((t: any) => t.isActive === isActive);
        }

        setFilteredTemplates(filtered);
    };

    const handleSearch = (text: string) => {
        setSearch(text);
        applySearch(text, statusFilter);
    };

    const handleStatusFilter = (status: string) => {
        setStatusFilter(status);
        applySearch(search, status);
    };

    const cancelSelection = () => {
        setSelectionMode(false);
        setSelectedIds([]);
    };

    const toggleSelect = (id: number) => {
        if (selectedIds.includes(id)) {
            const newSelection = selectedIds.filter(sid => sid !== id);
            setSelectedIds(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const toggleSelectAll = () => {
        const filteredIds = filteredTemplates.map((t: any) => t.id);
        const allSelected = filteredIds.every(id => selectedIds.includes(id));

        if (allSelected) {
            const newSelection = selectedIds.filter(id => !filteredIds.includes(id));
            setSelectedIds(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            const newSelection = Array.from(new Set([...selectedIds, ...filteredIds]));
            setSelectedIds(newSelection);
        }
    };

    const handleLongPress = (id: number) => {
        if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds([id]);
        }
    };

    const handleBulkAction = async (action: 'delete' | 'activate' | 'deactivate') => {
        if (selectedIds.length === 0) return;

        const confirmText = action === 'delete' ? "Seçilen şablonları silmek istediğinize emin misiniz?" :
            action === 'activate' ? "Seçilenleri aktif yapmak istiyor musunuz?" : "Seçilenleri pasif yapmak istiyor musunuz?";

        showAlert({
            title: "Toplu İşlem",
            message: confirmText,
            type: 'confirm',
            showCancel: true,
            confirmText: "Evet",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                setIsSubmitting(true);
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    if (action === 'delete') {
                        const res = await axios.post(`${API_URL}/Templates/bulk-delete`, selectedIds, { headers: { Authorization: `Bearer ${token}` } });
                        showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
                    } else {
                        await axios.post(`${API_URL}/Templates/bulk-status`, {
                            ids: selectedIds,
                            status: action === 'activate'
                        }, { headers: { Authorization: `Bearer ${token}` } });
                        showAlert({ title: "Başarılı", message: "Durumlar güncellendi.", type: 'success' });
                    }
                    cancelSelection();
                    fetchTemplates();
                } catch (e: any) {
                    showAlert({ title: "Hata", message: "İşlem yapılamadı.", type: 'error' });
                } finally {
                    setIsSubmitting(false);
                }
            }
        });
    };

    const handleImportWord = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                copyToCacheDirectory: true
            });

            if (result.canceled) return;
            const file = result.assets[0];

            setIsSubmitting(true);
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');

            const formData = new FormData();
            formData.append('file', {
                uri: Platform.OS === 'ios' ? file.uri.replace('file://', '') : file.uri,
                name: file.name,
                type: file.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            } as any);

            const res = await axios.post(`${API_URL}/Templates/import-word`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                }
            });

            showAlert({ title: "Başarılı", message: res.data?.message || "Word belgesi başarıyla şablona çevrildi.", type: 'success' });
            fetchTemplates();

        } catch (e: any) {
            console.error("Import hatası:", e);
            const errorMsg = e.response?.data?.message || "Dosya yüklenirken bir hata oluştu.";
            showAlert({ title: "Hata", message: errorMsg, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSwipeToggle = async (templateId: number, isActive: boolean) => {
        swipeableRefs.current[templateId]?.close();
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/Templates/bulk-status`, {
                ids: [templateId],
                status: !isActive
            }, { headers: { Authorization: `Bearer ${token}` } });
            fetchTemplates();
            showAlert({
                title: "İşlem Başarılı",
                message: isActive ? "Şablon pasife alındı." : "Şablon aktif edildi.",
                type: 'success'
            });
        } catch {
            showAlert({ title: "Hata", message: "İşlem yapılamadı.", type: 'error' });
        }
    };

    const renderRightActions = (templateId: number, isActive: boolean) => (
        <TouchableOpacity
            style={[styles.swipeToggleBtn, { backgroundColor: isActive ? '#f97316' : '#22c55e' }]}
            onPress={() => handleSwipeToggle(templateId, isActive)}
            activeOpacity={0.8}
        >
            <Ionicons name={isActive ? "pause-circle" : "play-circle"} size={22} color="#fff" />
            <Text style={styles.swipeBtnText}>{isActive ? 'Pasif Yap' : 'Aktif Yap'}</Text>
        </TouchableOpacity>
    );

    const renderItem = React.useCallback(({ item }: any) => {
        const isSelected = selectedIds.includes(item.id);
        return (
            <Swipeable
                ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
                enabled={!selectionMode}
                renderRightActions={() => !selectionMode ? renderRightActions(item.id, item.isActive) : null}
                rightThreshold={40}
                friction={2}
                overshootRight={false}
            >
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.card, isSelected && styles.selectedCard]}
                    onPress={() => selectionMode ? toggleSelect(item.id) : router.push(`/templates/${item.id}` as any)}
                    onLongPress={() => handleLongPress(item.id)}
                >
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, isSelected && { backgroundColor: '#0d6efd' }]}>
                            <Ionicons name={isSelected ? "checkbox" : "document-text"} size={22} color={isSelected ? "#fff" : "#0d6efd"} />
                        </View>
                        <View style={styles.info}>
                            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.date}>{new Date(item.createdDate).toLocaleDateString('tr-TR')}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: item.isActive ? '#e8f5e9' : '#fce4e4' }]}>
                            <Text style={[styles.statusText, { color: item.isActive ? '#28a745' : '#dc3545' }]}>
                                {item.isActive ? 'Aktif' : 'Pasif'}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    }, [selectionMode, selectedIds]);

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* HEADER / ACTION BAR */}
            <View style={[styles.header, selectionMode && styles.selectionHeader]}>
                {selectionMode ? (
                    <>
                        <View style={styles.leftAction}>
                            <TouchableOpacity style={styles.headerBtn} onPress={cancelSelection}>
                                <Ionicons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                            <View style={styles.selectionBadge}>
                                <Text style={styles.selectionCount}>{selectedIds.length}</Text>
                                <Text style={styles.selectionLabel}>Seçildi</Text>
                            </View>
                        </View>
                        <View style={styles.actionGroup}>
                            <TouchableOpacity onPress={toggleSelectAll} style={styles.actionIcon}>
                                <Ionicons
                                    name={filteredTemplates.length > 0 && filteredTemplates.every((t: any) => selectedIds.includes(t.id)) ? "checkmark-done-circle" : "checkmark-circle-outline"}
                                    size={26}
                                    color="#fff"
                                />
                            </TouchableOpacity>
                            <View style={styles.headerDivider} />
                            <TouchableOpacity onPress={() => handleBulkAction('activate')} style={styles.actionIcon}>
                                <Ionicons name="play" size={24} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleBulkAction('deactivate')} style={styles.actionIcon}>
                                <Ionicons name="pause" size={24} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleBulkAction('delete')} style={[styles.actionIcon, styles.deleteAction]}>
                                <Ionicons name="trash" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                            <Ionicons name="arrow-back" size={24} color="#212529" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Şablonlarım</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity onPress={handleImportWord} style={styles.headerBtn}>
                                <Ionicons name="document-text" size={24} color="#198754" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.push('/templates/new' as any)} style={[styles.headerBtn, { marginLeft: 10 }]}>
                                <Ionicons name="add-circle" size={28} color="#0d6efd" />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>

            <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#adb5bd" style={{ marginRight: 10 }} />
                <TextInput placeholderTextColor="#64748b"
                    style={styles.searchInput}
                    placeholder="Şablonlarda ara..."
                    value={search}
                    onChangeText={handleSearch}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => handleSearch('')}>
                        <Ionicons name="close-circle" size={20} color="#adb5bd" />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.statusFilters}>
                {['All', 'Active', 'Passive'].map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterBtn, statusFilter === f && styles.activeFilterBtn]}
                        onPress={() => handleStatusFilter(f)}
                    >
                        <Text style={[styles.filterBtnText, statusFilter === f && styles.activeFilterBtnText]}>
                            {f === 'All' ? 'Tümü' : (f === 'Active' ? 'Aktif' : 'Pasif')}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? <ActivityIndicator size="large" color="#0d6efd" style={{ marginTop: 50 }} /> : (
                <FlatList
                    data={filteredTemplates}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={Platform.OS === 'android'}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="document-text-outline" size={80} color="#dee2e6" />
                            <Text style={styles.emptyTitle}>Şablon Bulunamadı</Text>
                            <Text style={styles.emptySub}>Henüz bir şablon oluşturmamışsınız.</Text>
                        </View>
                    }
                />
            )}

            {isSubmitting && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 50, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
    selectionHeader: { backgroundColor: '#4f46e5', borderBottomColor: '#4338ca', elevation: 8, shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 10 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#212529' },
    leftAction: { flexDirection: 'row', alignItems: 'center' },
    selectionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginLeft: 10 },
    selectionCount: { color: '#fff', fontWeight: '900', fontSize: 16 },
    selectionLabel: { color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 6, opacity: 0.9 },
    headerBtn: { padding: 5 },
    actionGroup: { flexDirection: 'row', alignItems: 'center' },
    actionIcon: { padding: 8, marginLeft: 2 },
    headerDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 8 },
    deleteAction: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, marginLeft: 10 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 15, marginTop: 15, paddingHorizontal: 15, borderRadius: 12, height: 50, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05 },
    statusFilters: { flexDirection: 'row', gap: 10, marginHorizontal: 15, marginTop: 10, marginBottom: 5 },
    filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05 },
    activeFilterBtn: { backgroundColor: '#e7f0ff', borderWidth: 1, borderColor: '#0d6efd' },
    filterBtnText: { fontSize: 13, color: '#6c757d', fontWeight: '600' },
    activeFilterBtnText: { color: '#0d6efd' },
    searchInput: { flex: 1, fontSize: 16, color: '#333' },
    card: { backgroundColor: '#fff', borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, borderWidth: 1, borderColor: 'transparent' },
    selectedCard: { borderColor: '#0d6efd', backgroundColor: '#f0f7ff' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 15 },
    iconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#e7f0ff', justifyContent: 'center', alignItems: 'center' },
    info: { flex: 1, marginLeft: 15 },
    title: { fontSize: 16, fontWeight: 'bold', color: '#212529' },
    date: { fontSize: 12, color: '#adb5bd', marginTop: 2 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 11, fontWeight: 'bold' },
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#495057', marginTop: 20 },
    emptySub: { fontSize: 14, color: '#6c757d', textAlign: 'center', marginTop: 10 },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    swipeToggleBtn: { justifyContent: 'center', alignItems: 'center', width: 85, marginBottom: 12, borderTopRightRadius: 15, borderBottomRightRadius: 15, flexDirection: 'column', gap: 4 },
    swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
