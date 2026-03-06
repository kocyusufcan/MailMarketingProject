import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, Platform, TouchableOpacity, TextInput, Modal, BackHandler } from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';
import { Swipeable } from 'react-native-gesture-handler';

export default function SubscribersScreen() {
    const { showAlert } = useAlert();
    const swipeableRefs = useRef<{ [key: number]: Swipeable | null }>({});
    const [subscribers, setSubscribers] = useState([]);
    const [filteredSubscribers, setFilteredSubscribers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All'); // All, Active, Passive
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Ref'ler: async fetchSubscribers içinde her zaman güncel değeri okur
    const statusFilterRef = useRef('All');
    const searchRef = useRef('');

    const [modalVisible, setModalVisible] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const router = useRouter();

    useFocusEffect(
        React.useCallback(() => {
            fetchSubscribers();

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

    const fetchSubscribers = async () => {
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.get(`${API_URL}/Subscribers/all`, { headers: { Authorization: `Bearer ${token}` } });
            setSubscribers(res.data);
            // Ref değerlerini kullanarak (stale closure'dan kaçınma)
            applySearch(searchRef.current, statusFilterRef.current, res.data);
        } catch (e) {
            console.error("Aboneler yüklenemedi", e);
        } finally {
            setLoading(false);
        }
    };

    const applySearch = (text: string, status = statusFilter, data = subscribers) => {
        const sourceData = Array.isArray(data) ? data : [];
        let filtered = sourceData;

        // Metin araması
        if (text) {
            filtered = filtered.filter((s: any) =>
                ((s.firstName || "") + " " + (s.lastName || "")).toLowerCase().includes(text.toLowerCase()) ||
                (s.email || "").toLowerCase().includes(text.toLowerCase())
            );
        }

        // Durum araması
        if (status !== 'All') {
            const isActive = status === 'Active';
            filtered = filtered.filter((s: any) => s.isActive === isActive);
        }

        setFilteredSubscribers(filtered);
    };

    const handleSearch = (text: string) => {
        setSearch(text);
        searchRef.current = text;
        applySearch(text, statusFilter);
    };

    const handleStatusFilter = (status: string) => {
        setStatusFilter(status);
        statusFilterRef.current = status;
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
        const filteredIds = filteredSubscribers.map((s: any) => s.id);
        const allSelected = filteredIds.every(id => selectedIds.includes(id));

        if (allSelected) {
            // Seçimi kaldır (sadece filtrelenmiş olanlardan)
            const newSelection = selectedIds.filter(id => !filteredIds.includes(id));
            setSelectedIds(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            // Hepsini seç (mevcut seçime ekle)
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

        const confirmText = action === 'delete' ? "Seçilen aboneleri tamamen silmek istediğinize emin misiniz?" :
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
                        const res = await axios.post(`${API_URL}/Subscribers/bulk-delete`, selectedIds, { headers: { Authorization: `Bearer ${token}` } });
                        showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
                    } else {
                        const res = await axios.post(`${API_URL}/Subscribers/bulk-status`, {
                            ids: selectedIds,
                            status: action === 'activate'
                        }, { headers: { Authorization: `Bearer ${token}` } });
                        showAlert({ title: "Başarılı", message: res.data.message, type: 'success' });
                    }
                    cancelSelection();
                    fetchSubscribers();
                } catch (e: any) {
                    const errorMsg = e.response?.data?.message || "İşlem yapılamadı.";
                    showAlert({ title: "Hata", message: errorMsg, type: 'error' });
                } finally {
                    setIsSubmitting(false);
                }
            }
        });
    };

    const validateEmail = (email: string) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    };

    const handleAddSubscriber = async () => {
        if (!firstName || !email) {
            showAlert({ title: "Uyarı", message: "Ad ve E-posta zorunludur.", type: 'warning' });
            return;
        }

        if (!validateEmail(email)) {
            showAlert({ title: "Uyarı", message: "Lütfen geçerli bir e-posta adresi girin.", type: 'warning' });
            return;
        }
        setIsSubmitting(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/Subscribers/add/1`, {
                firstName, lastName, email, isActive: true
            }, { headers: { Authorization: `Bearer ${token}` } });

            showAlert({ title: "Başarılı", message: "Abone kaydedildi.", type: 'success' });
            setModalVisible(false);
            setFirstName(''); setLastName(''); setEmail('');
            fetchSubscribers();
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || "Abone eklenirken bir hata oluştu.";
            showAlert({ title: "Hata", message: errorMsg, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleImportExcel = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
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
                type: file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            } as any);

            const res = await axios.post(`${API_URL}/Subscribers/import`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                }
            });

            showAlert({ title: "Başarılı", message: res.data?.message || "Excel aktarımı tamamlandı.", type: 'success' });
            fetchSubscribers();

        } catch (e: any) {
            console.log("Import sonucu:", e.response?.data?.message);
            const errorMsg = e.response?.data?.message || "Dosya yüklenirken bir hata oluştu.";
            showAlert({ title: "Hata", message: errorMsg, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSwipeToggle = async (subId: number, isActive: boolean) => {
        swipeableRefs.current[subId]?.close();
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            await axios.post(`${API_URL}/Subscribers/toggle-status/${subId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
            fetchSubscribers();
            showAlert({
                title: "İşlem Başarılı",
                message: isActive ? "Abone pasife alındı." : "Abone aktif edildi.",
                type: 'success'
            });
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || "İşlem yapılamadı.";
            showAlert({ title: "Hata", message: errorMsg, type: 'error' });
        }
    };

    const renderLeftActions = (subId: number, isActive: boolean) => (
        <TouchableOpacity
            style={[styles.swipeToggleBtn, { backgroundColor: isActive ? '#f97316' : '#22c55e' }]}
            onPress={() => handleSwipeToggle(subId, isActive)}
            activeOpacity={0.8}
        >
            <Ionicons name={isActive ? "pause-circle" : "play-circle"} size={22} color="#fff" />
            <Text style={styles.swipeBtnText}>{isActive ? 'Pasif Yap' : 'Aktif Yap'}</Text>
        </TouchableOpacity>
    );

    const handleSwipeDelete = (subId: number) => {
        swipeableRefs.current[subId]?.close();
        showAlert({
            title: "Aboneyi Sil",
            message: "Bu aboneyi kalıcı olarak silmek istediğinize emin misiniz?",
            type: 'confirm',
            showCancel: true,
            confirmText: "Sil",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    const res = await axios.delete(`${API_URL}/Subscribers/delete/${subId}`, { headers: { Authorization: `Bearer ${token}` } });
                    fetchSubscribers();
                    showAlert({ title: "İşlem Sonucu", message: res.data.message, type: 'success' });
                } catch (e: any) {
                    const errorMsg = e.response?.data?.message || "İşlem yapılamadı.";
                    showAlert({ title: "Hata", message: errorMsg, type: 'error' });
                }
            }
        });
    };

    const renderRightActions = (subId: number) => (
        <View style={styles.swipeActionsRow}>
            <TouchableOpacity
                style={styles.swipeEditBtn}
                onPress={() => {
                    swipeableRefs.current[subId]?.close();
                    router.push(`/subscribers/edit/${subId}` as any);
                }}
                activeOpacity={0.8}
            >
                <Ionicons name="pencil" size={20} color="#fff" />
                <Text style={styles.swipeBtnText}>Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.swipeDeleteBtn}
                onPress={() => handleSwipeDelete(subId)}
                activeOpacity={0.8}
            >
                <Ionicons name="trash" size={20} color="#fff" />
                <Text style={styles.swipeBtnText}>Sil</Text>
            </TouchableOpacity>
        </View>
    );

    const renderItem = ({ item }: any) => {
        const isSelected = selectedIds.includes(item.id);
        return (
            <Swipeable
                ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
                enabled={!selectionMode}
                renderLeftActions={() => !selectionMode ? renderLeftActions(item.id, item.isActive) : null}
                renderRightActions={() => !selectionMode ? renderRightActions(item.id) : null}
                leftThreshold={40}
                rightThreshold={40}
                friction={2}
                overshootLeft={false}
                overshootRight={false}
            >
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.card, isSelected && styles.selectedCard]}
                    onPress={() => selectionMode ? toggleSelect(item.id) : router.push(`/subscribers/edit/${item.id}` as any)}
                    onLongPress={() => handleLongPress(item.id)}
                >
                    <View style={[styles.statusStrip, { backgroundColor: item.isActive ? '#28a745' : '#dc3545' }]} />
                    <View style={styles.cardMain}>
                        <View style={[styles.avatar, isSelected && { backgroundColor: '#0d6efd' }]}>
                            {isSelected ? (
                                <Ionicons name="checkbox" size={24} color="#fff" />
                            ) : (
                                <Text style={styles.avatarText}>{item.firstName?.[0] || 'A'}</Text>
                            )}
                        </View>
                        <View style={styles.info}>
                            <View style={styles.nameRow}>
                                <Text style={styles.name} numberOfLines={1}>{item.firstName} {item.lastName}</Text>
                                <Text style={[styles.statusTag, { color: item.isActive ? '#28a745' : '#dc3545' }]}>
                                    {item.isActive ? 'Aktif' : 'Pasif'}
                                </Text>
                            </View>
                            <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                        </View>
                        {!selectionMode && (
                            <View style={{ justifyContent: 'center', paddingRight: 15 }}>
                                <Ionicons name="chevron-forward" size={18} color="#adb5bd" />
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    };

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
                                    name={filteredSubscribers.length > 0 && filteredSubscribers.every((s: any) => selectedIds.includes(s.id)) ? "checkmark-done-circle" : "checkmark-circle-outline"}
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
                        <Text style={styles.headerTitle}>Tüm Aboneler</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity onPress={handleImportExcel} style={styles.headerBtn}>
                                <Ionicons name="document-text" size={24} color="#198754" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setModalVisible(true)} style={[styles.headerBtn, { marginLeft: 10 }]}>
                                <Ionicons name="person-add" size={24} color="#0d6efd" />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>

            <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#adb5bd" style={{ marginRight: 10 }} />
                <TextInput placeholderTextColor="#64748b"
                    style={styles.searchInput}
                    placeholder="İsim veya e-posta ile ara..."
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
                    data={filteredSubscribers}
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
                            <Ionicons name="people-outline" size={80} color="#dee2e6" />
                            <Text style={styles.emptyTitle}>Abone Bulunamadı</Text>
                            <Text style={styles.emptySub}>Aradığınız kriterlere uygun abone bulunmuyor.</Text>
                        </View>
                    }
                />
            )}

            <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
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
                        <Text style={styles.modalTitle}>Hızlı Ekle</Text>
                        <View style={styles.inputContainer}>
                            <TextInput placeholderTextColor="#64748b" style={styles.input} placeholder="Ad" value={firstName} onChangeText={setFirstName} />
                            {firstName.length > 0 && (
                                <TouchableOpacity style={styles.clearBtn} onPress={() => setFirstName('')}>
                                    <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={styles.inputContainer}>
                            <TextInput placeholderTextColor="#64748b" style={styles.input} placeholder="Soyad" value={lastName} onChangeText={setLastName} />
                            {lastName.length > 0 && (
                                <TouchableOpacity style={styles.clearBtn} onPress={() => setLastName('')}>
                                    <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={styles.inputContainer}>
                            <TextInput placeholderTextColor="#64748b" style={styles.input} placeholder="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                            {email.length > 0 && (
                                <TouchableOpacity style={styles.clearBtn} onPress={() => setEmail('')}>
                                    <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={styles.cancelBtnText}>İptal</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleAddSubscriber} disabled={isSubmitting}>
                                {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

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
    searchInput: { flex: 1, fontSize: 16, color: '#333' },
    statusFilters: { flexDirection: 'row', gap: 10, marginHorizontal: 15, marginTop: 10, marginBottom: 5 },
    filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05 },
    activeFilterBtn: { backgroundColor: '#e7f0ff', borderWidth: 1, borderColor: '#0d6efd' },
    filterBtnText: { fontSize: 13, color: '#6c757d', fontWeight: '600' },
    activeFilterBtnText: { color: '#0d6efd' },
    card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 15, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, borderWidth: 1, borderColor: 'transparent' },
    selectedCard: { borderColor: '#0d6efd', backgroundColor: '#f0f7ff' },
    statusStrip: { width: 4 },
    cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 15 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e7f0ff', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#0d6efd', fontWeight: 'bold', fontSize: 16 },
    info: { flex: 1, marginLeft: 15 },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { fontSize: 15, fontWeight: 'bold', color: '#212529', flex: 1 },
    statusTag: { fontSize: 10, fontWeight: 'bold', marginLeft: 5 },
    email: { fontSize: 12, color: '#6c757d', marginTop: 2 },
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#495057', marginTop: 20 },
    emptySub: { fontSize: 14, color: '#6c757d', textAlign: 'center', marginTop: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
    modalView: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 25 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#212529', textAlign: 'center' },
    inputContainer: { position: 'relative' },
    input: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#dee2e6', borderRadius: 10, padding: 12, paddingRight: 40, fontSize: 15, marginBottom: 15, color: '#333' },
    clearBtn: { position: 'absolute', right: 10, top: 12 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    cancelBtn: { flex: 1, padding: 15, alignItems: 'center' },
    cancelBtnText: { color: '#dc3545', fontWeight: 'bold' },
    saveBtn: { flex: 1, backgroundColor: '#0d6efd', padding: 15, borderRadius: 10, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: 'bold' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    swipeActionsRow: { flexDirection: 'row', marginBottom: 12 },
    swipeToggleBtn: { justifyContent: 'center', alignItems: 'center', width: 85, marginBottom: 12, borderTopLeftRadius: 15, borderBottomLeftRadius: 15, flexDirection: 'column', gap: 4 },
    swipeEditBtn: { backgroundColor: '#0d6efd', justifyContent: 'center', alignItems: 'center', width: 75, borderRadius: 0, flexDirection: 'column', gap: 4 },
    swipeDeleteBtn: { backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center', width: 75, borderTopRightRadius: 15, borderBottomRightRadius: 15, flexDirection: 'column', gap: 4 },
    swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
