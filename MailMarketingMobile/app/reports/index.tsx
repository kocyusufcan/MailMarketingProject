import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, Platform, TextInput, ScrollView, Pressable, Keyboard } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_URL } from '@/constants/Config';
import { useAlert } from '@/context/AlertContext';
import { Swipeable } from 'react-native-gesture-handler';

// Tarih formatlama için güvenli yardımcı fonksiyon
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

const ReportItem = ({ item, onPress, onLongPress, isSelected, selectionMode }: any) => (
    <TouchableOpacity
        style={[styles.card, isSelected && styles.selectedCard]}
        onPress={() => selectionMode ? onPress(item.id) : onPress(item)}
        onLongPress={() => onLongPress(item.id)}
        activeOpacity={selectionMode ? 0.8 : (item.status === 'Error' ? 0.7 : 1)}
    >
        {selectionMode && (
            <View style={styles.checkboxContainer}>
                <Ionicons
                    name={isSelected ? "checkbox" : "square-outline"}
                    size={24}
                    color={isSelected ? "#0d6efd" : "#adb5bd"}
                />
            </View>
        )}
        <View style={[styles.indicator, { backgroundColor: item.status === 'Success' ? '#198754' : '#dc3545' }]} />
        <View style={styles.cardContent}>
            <View style={styles.row}>
                <Text style={styles.subject} numberOfLines={1}>{item.subject || "Konu Yok"}</Text>
                <Ionicons
                    name={item.status === 'Success' ? "checkmark-circle" : "alert-circle"}
                    size={18}
                    color={item.status === 'Success' ? "#198754" : "#dc3545"}
                />
            </View>
            <Text style={styles.receiver}>{item.receiverEmail || "Bilinmiyor"}</Text>
            <View style={styles.footer}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={12} color="#adb5bd" />
                    <Text style={styles.date}>{formatDate(item.sentDate)}</Text>
                </View>
                {item.status === 'Error' && !selectionMode && (
                    <Text style={styles.detailLink}>Hata Detayı için Tıkla</Text>
                )}
            </View>
        </View>
    </TouchableOpacity>
);

export default function ReportsScreen() {
    const { userId, userName } = useLocalSearchParams();
    const { showAlert } = useAlert();
    const swipeableRefs = useRef<{ [key: number]: Swipeable | null }>({});
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [bounceScanLoading, setBounceScanLoading] = useState(false);

    // Filtreleme State'leri
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All'); // All, Success, Error
    const [showFilters, setShowFilters] = useState(false);

    // Tarih Filtresi State'leri
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    // Seçim Modu State'leri
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const router = useRouter();

    useEffect(() => { fetchHistory(); }, [statusFilter, startDate, endDate]);

    const handleCheckBounces = async () => {
        setBounceScanLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
            const res = await axios.post(`${API_URL}/System/check-bounces`, {}, { headers: { Authorization: `Bearer ${token}` } });
            showAlert({ title: "İşlem Başarılı", message: res.data.message, type: 'success' });
            fetchHistory();
        } catch (error: any) {
            showAlert({ title: "Hata", message: error.response?.data?.message || "Bounce kontrolü yapılamadı.", type: 'error' });
        } finally {
            setBounceScanLoading(false);
        }
    };

    const fetchHistory = async (isRefreshing = false) => {
        if (!isRefreshing) setLoading(true);
        try {
            const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');

            const params = new URLSearchParams();
            if (statusFilter !== 'All') params.append('status', statusFilter);
            if (search) params.append('search', search);
            if (startDate) params.append('startDate', startDate.toISOString());
            if (endDate) {
                // End date'i günün sonuna ayarla (23:59:59) ki o günün verilerini de kapsasın
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                params.append('endDate', endOfDay.toISOString());
            }
            if (userId) params.append('targetUserId', userId as string);

            const res = await axios.get(`${API_URL}/Reports/history?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setHistory(res.data);
        } catch (e) {
            console.log("Rapor yükleme hatası");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleLongPress = useCallback((id: number) => {
        if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds([id]);
        }
    }, [selectionMode]);

    const toggleSelection = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            if (next.length === 0) setSelectionMode(false);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (history.length === 0) return;
        const allSelected = history.length > 0 && history.every(item => selectedIds.includes(item.id));
        if (allSelected) {
            setSelectedIds([]);
            setSelectionMode(false);
        } else {
            setSelectedIds(history.map(item => item.id));
        }
    }, [history, selectedIds]);

    const handlePressItem = useCallback((itemOrId: any) => {
        if (selectionMode) {
            toggleSelection(itemOrId); // Bu durumda itemOrId aslında ID'dir
            return;
        }

        if (itemOrId.status === 'Error') {
            const errorMsg = itemOrId.errorMessage || "Bilinmeyen bir hata oluştu.";
            showAlert({ title: "Hata ve Çözüm Önerisi", message: errorMsg, type: 'error' });
        }
    }, [selectionMode, toggleSelection, showAlert]);

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        showAlert({
            title: "Toplu Sil",
            message: `${selectedIds.length} adet raporu silmek istediğinize emin misiniz?`,
            type: 'confirm',
            showCancel: true,
            confirmText: "Sil",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    await axios.post(`${API_URL}/Reports/bulk-delete`, selectedIds, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setSelectionMode(false);
                    setSelectedIds([]);
                    fetchHistory();
                } catch (e) {
                    showAlert({ title: "Hata", message: "Silme işlemi başarısız.", type: 'error' });
                }
            }
        });
    };

    const handleSearch = () => {
        fetchHistory();
    };

    const handleExportCsv = async () => {
        try {
            const token = Platform.OS === 'web'
                ? localStorage.getItem('userToken')
                : await SecureStore.getItemAsync('userToken');

            const params = new URLSearchParams();
            if (statusFilter !== 'All') params.append('status', statusFilter);
            if (search) params.append('search', search);
            if (startDate) params.append('startDate', startDate.toISOString());
            if (endDate) {
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                params.append('endDate', endOfDay.toISOString());
            }
            if (userId) params.append('targetUserId', userId as string);

            const url = `${API_URL}/Reports/export-csv?${params.toString()}`;
            const fileName = `Rapor_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '')}.csv`;
            const fileUri = FileSystem.cacheDirectory + fileName;

            const result = await FileSystem.downloadAsync(url, fileUri, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (result.status === 200) {
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                    await Sharing.shareAsync(result.uri, {
                        mimeType: 'text/csv',
                        dialogTitle: 'Raporu Paylaş veya Kaydet',
                        UTI: 'public.comma-separated-values-text'
                    });
                } else {
                    showAlert({ title: "Bilgi", message: "Bu cihazda paylaşım desteklenmiyor.", type: 'info' });
                }
            } else {
                showAlert({ title: "Hata", message: "Rapor indirilemedi.", type: 'error' });
            }
        } catch (e) {
            showAlert({ title: "Sistem Hatası", message: "Dışa aktarma sırasında bir sorun oluştu.", type: 'error' });
        }
    };

    const handleSwipeDelete = useCallback((reportId: number) => {
        swipeableRefs.current[reportId]?.close();
        showAlert({
            title: "Raporu Sil",
            message: "Bu raporu silmek istediğinize emin misiniz?",
            type: 'confirm',
            showCancel: true,
            confirmText: "Sil",
            cancelText: "Vazgeç",
            onConfirm: async () => {
                try {
                    const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
                    await axios.post(`${API_URL}/Reports/bulk-delete`, [reportId], {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    fetchHistory();
                    showAlert({ title: "İşlem Başarılı", message: "Rapor silindi.", type: 'success' });
                } catch {
                    showAlert({ title: "Hata", message: "Silme işlemi başarısız.", type: 'error' });
                }
            }
        });
    }, [showAlert]);

    const renderRightActions = useCallback((reportId: number) => (
        <TouchableOpacity
            style={styles.swipeDeleteBtn}
            onPress={() => handleSwipeDelete(reportId)}
            activeOpacity={0.8}
        >
            <Ionicons name="trash" size={22} color="#fff" />
            <Text style={styles.swipeBtnText}>Sil</Text>
        </TouchableOpacity>
    ), [handleSwipeDelete]);

    const renderItem = useCallback(({ item }: any) => (
        <Swipeable
            ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
            enabled={!selectionMode}
            renderRightActions={() => !selectionMode ? renderRightActions(item.id) : null}
            rightThreshold={40}
            friction={2}
            overshootRight={false}
        >
            <ReportItem
                item={item}
                onPress={handlePressItem}
                onLongPress={handleLongPress}
                isSelected={selectedIds.includes(item.id)}
                selectionMode={selectionMode}
            />
        </Swipeable>
    ), [handlePressItem, handleLongPress, selectedIds, selectionMode, renderRightActions]);

    return (
        <Pressable style={styles.container} onPress={Keyboard.dismiss}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header / Selection Bar */}
            <View style={[styles.header, selectionMode && styles.selectionHeader]}>
                {selectionMode ? (
                    <>
                        <View style={styles.leftAction}>
                            <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds([]); }} style={styles.headerBtn}>
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
                                    name={history.length > 0 && history.every(item => selectedIds.includes(item.id)) ? "checkmark-done-circle" : "checkmark-circle-outline"}
                                    size={26}
                                    color="#fff"
                                />
                            </TouchableOpacity>
                            <View style={styles.headerDivider} />
                            <TouchableOpacity onPress={handleBulkDelete} style={[styles.actionIcon, styles.deleteAction]}>
                                <Ionicons name="trash" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#212529" /></TouchableOpacity>
                        <Text style={styles.title}>{userName ? `${userName} Raporları` : "Gönderim Raporları"}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                            <TouchableOpacity onPress={handleExportCsv}>
                                <Ionicons name="download-outline" size={22} color="#198754" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setShowFilters(!showFilters)}>
                                <Ionicons name={showFilters ? "funnel" : "funnel-outline"} size={22} color={showFilters ? "#0d6efd" : "#212529"} />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>

            {/* Filtre Alanı */}
            {showFilters && !selectionMode && (
                <View style={styles.filterContainer}>
                    <View style={styles.searchBar}>
                        <TextInput placeholderTextColor="#64748b"
                            style={styles.searchInput}
                            placeholder="Mail veya konu ara..."
                            value={search}
                            onChangeText={setSearch}
                            onSubmitEditing={handleSearch}
                        />
                        <TouchableOpacity onPress={handleSearch} style={styles.searchIcon}>
                            <Ionicons name="search" size={20} color="#6c757d" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.statusFilters}>
                        {['All', 'Success', 'Error'].map(f => (
                            <TouchableOpacity
                                key={f}
                                style={[styles.filterBtn, statusFilter === f && styles.activeFilterBtn]}
                                onPress={() => setStatusFilter(f)}
                            >
                                <Text style={[styles.filterBtnText, statusFilter === f && styles.activeFilterBtnText]}>
                                    {f === 'All' ? 'Tümü' : (f === 'Success' ? 'Başarılı' : 'Hatalı')}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Tarih Seçimi */}
                    <View style={styles.dateFilterContainer}>
                        <Pressable style={styles.dateBox} onPress={() => setShowStartPicker(true)}>
                            <Ionicons name="calendar-outline" size={16} color="#6c757d" />
                            <Text style={styles.dateText}>
                                {startDate ? startDate.toLocaleDateString('tr-TR') : 'Başlangıç'}
                            </Text>
                        </Pressable>
                        <Ionicons name="arrow-forward" size={16} color="#dee2e6" />
                        <Pressable style={styles.dateBox} onPress={() => setShowEndPicker(true)}>
                            <Ionicons name="calendar-outline" size={16} color="#6c757d" />
                            <Text style={styles.dateText}>
                                {endDate ? endDate.toLocaleDateString('tr-TR') : 'Bitiş'}
                            </Text>
                        </Pressable>
                        {(startDate || endDate) && (
                            <TouchableOpacity style={styles.clearDates} onPress={() => { setStartDate(null); setEndDate(null); }}>
                                <Ionicons name="close-circle" size={20} color="#dc3545" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {showStartPicker && (
                        <DateTimePicker
                            value={startDate || new Date()}
                            mode="date"
                            display="default"
                            onChange={(event, date) => {
                                setShowStartPicker(false);
                                if (date) {
                                    setStartDate(date);
                                }
                            }}
                        />
                    )}

                    {showEndPicker && (
                        <DateTimePicker
                            value={endDate || new Date()}
                            mode="date"
                            display="default"
                            maximumDate={new Date()}
                            onChange={(event, date) => {
                                setShowEndPicker(false);
                                if (date) {
                                    setEndDate(date);
                                }
                            }}
                        />
                    )}
                </View>
            )}

            {!selectionMode && (
                <>
                    {/* Bounce Check Action Card - sadece kendi raporlarında göster */}
                    {!userId && (
                        <View style={styles.bounceCard}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.bounceCardTitle}>Bounce Kontrolü</Text>
                                <Text style={styles.bounceCardSub}>Gelen kutusundaki hata mesajlarını tara.</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.bounceBtn}
                                onPress={handleCheckBounces}
                                disabled={bounceScanLoading}
                            >
                                {bounceScanLoading
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <><Ionicons name="sync" size={18} color="#fff" /><Text style={styles.bounceBtnText}>Şimdi Tara</Text></>
                                }
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxText}>
                            <Ionicons name="information-circle" size={14} /> <Text style={{ fontWeight: 'bold' }}>Bilgi:</Text> "Başarılı" durumu, mailin sunucuya sorunsuz iletildiğini gösterir. Alıcı adresinin hatalı olup olmadığını (bounce) yukarıdaki <Text style={{ fontWeight: 'bold' }}>"Şimdi Tara"</Text> butonu ile kontrol edebilirsiniz.
                        </Text>
                    </View>
                </>
            )}

            {loading ? <ActivityIndicator size="large" color="#0d6efd" style={{ marginTop: 50 }} /> : (
                <FlatList
                    key={selectionMode ? 's' : 'n'} // 🚀 NUCLEAR OPTION: Mod geçişlerinde listeyi tamamen SIFIRLA
                    data={history}
                    keyExtractor={(item: any, index) => item.id?.toString() || index.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    onRefresh={() => fetchHistory(true)}
                    refreshing={refreshing}

                    // Sabit yükseklik bildirimi
                    getItemLayout={(data, index) => (
                        { length: 105, offset: 105 * index, index }
                    )}

                    // 🚀 AKICI VE GARANTİLİ RENDER AYARLARI
                    initialNumToRender={40} // Ekrandan çok daha fazlasını önceden çiz
                    maxToRenderPerBatch={40}
                    windowSize={21}
                    removeClippedSubviews={false}
                    extraData={[selectedIds, selectionMode, statusFilter]}
                    updateCellsBatchingPeriod={30}

                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="stats-chart-outline" size={80} color="#dee2e6" />
                            <Text style={styles.emptyTitle}>Kayıt Bulunamadı</Text>
                            <Text style={styles.emptySub}>Arama veya filtre kriterlerinize uygun sonuç yok.</Text>
                        </View>
                    }
                />
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 50, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
    selectionHeader: { backgroundColor: '#4f46e5', borderBottomColor: '#4338ca', elevation: 8, shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 10 },
    leftAction: { flexDirection: 'row', alignItems: 'center' },
    selectionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginLeft: 10 },
    selectionCount: { color: '#fff', fontWeight: '900', fontSize: 16 },
    selectionLabel: { color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 6, opacity: 0.9 },
    headerBtn: { padding: 5 },
    actionIcon: { padding: 8, marginLeft: 2 },
    actionGroup: { flexDirection: 'row', alignItems: 'center' },
    headerDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 8 },
    deleteAction: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, marginLeft: 10 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#212529' },

    filterContainer: { backgroundColor: '#fff', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    searchBar: { flexDirection: 'row', backgroundColor: '#f1f3f5', borderRadius: 12, alignItems: 'center', paddingHorizontal: 15, marginBottom: 12 },
    searchInput: { flex: 1, height: 45, fontSize: 15, color: '#212529' },
    searchIcon: { padding: 5 },
    statusFilters: { flexDirection: 'row', gap: 10 },
    filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f1f3f5', alignItems: 'center' },
    activeFilterBtn: { backgroundColor: '#e7f0ff', borderWidth: 1, borderColor: '#0d6efd' },
    filterBtnText: { fontSize: 12, color: '#6c757d', fontWeight: '600' },
    activeFilterBtnText: { color: '#0d6efd' },

    dateFilterContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f3f5', paddingTop: 12 },
    dateBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eee' },
    dateText: { fontSize: 13, color: '#495057' },
    clearDates: { padding: 5 },

    card: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 15,
        marginBottom: 15,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        alignItems: 'stretch',
        height: 90 // Sabit yükseklik FlatList performansı için kritiktir
    },
    selectedCard: { backgroundColor: '#f0f7ff', borderColor: '#0d6efd', borderWidth: 1 },
    checkboxContainer: { paddingLeft: 12 },
    indicator: { width: 5, alignSelf: 'stretch', backgroundColor: '#0d6efd' },
    cardContent: { flex: 1, padding: 15 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    subject: { fontSize: 16, fontWeight: 'bold', color: '#212529', flex: 1, marginRight: 10 },
    receiver: { fontSize: 13, color: '#6c757d', marginTop: 4 },
    footer: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    date: { fontSize: 11, color: '#adb5bd', marginLeft: 5 },
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#495057', marginTop: 20 },
    emptySub: { fontSize: 14, color: '#6c757d', textAlign: 'center', marginTop: 10 },

    bounceCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', marginHorizontal: 20, marginTop: 15, padding: 16, borderRadius: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05 },
    bounceCardTitle: { fontSize: 15, fontWeight: '800', color: '#333' },
    bounceCardSub: { fontSize: 12, color: '#64748b', marginTop: 3 },
    bounceBtn: { backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100, justifyContent: 'center' },
    bounceBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

    infoBox: { backgroundColor: '#fff3cd', padding: 15, marginHorizontal: 20, marginTop: 10, marginBottom: 5, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#ffc107' },
    infoBoxText: { fontSize: 12, color: '#856404', lineHeight: 18 },
    detailLink: { fontSize: 11, color: '#dc3545', fontWeight: 'bold', textDecorationLine: 'underline', marginLeft: 'auto' },
    swipeDeleteBtn: { backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center', width: 75, marginBottom: 10, borderTopRightRadius: 12, borderBottomRightRadius: 12, flexDirection: 'column', gap: 4 },
    swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
