import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Animated, LayoutAnimation, UIManager, Platform, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaretLeft, Funnel, Heart, Drop, Pulse, Siren, CaretDown, CaretUp } from 'phosphor-react-native';
import { LineChart } from 'react-native-gifted-charts';

// Importar Design System
import { COLORS, StatusBadge, LineChartCard } from '../components/ui';
import { loadReadings } from '../services/storageService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const parseSafeDate = (dateStr) => {
  if (dateStr === undefined || dateStr === null) return new Date();
  if (typeof dateStr === 'number' || dateStr instanceof Date) {
    return new Date(dateStr);
  }
  let formatted = String(dateStr);
  if (formatted.includes(' ') && !formatted.includes('T')) {
    formatted = formatted.replace(' ', 'T');
  }
  const d = new Date(formatted);
  return isNaN(d.getTime()) ? new Date(dateStr) : d;
};

// 1. FilterChip
const FilterChip = ({ label, active, onPress, isSos }) => {
  let bg = active ? COLORS.primary : '#FFF';
  let color = active ? '#FFF' : COLORS.textMuted;
  if (isSos) {
    bg = active ? COLORS.sos : '#FFF';
    color = active ? '#FFF' : COLORS.sos;
  }
  return (
    <TouchableOpacity 
      style={[styles.chip, { backgroundColor: bg, borderColor: isSos ? COLORS.sosBorder : COLORS.borderDark }]} 
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
};

// 2. MeasurementRow
const MeasurementRow = ({ reading }) => {
  let Icon, color, bg, typeLabel, valLabel, status;
  
  if (reading.type === 'BPM') { 
    const bpm = reading.bpm || reading.value;
    Icon = Heart; color = COLORS.red; bg = COLORS.redBg; typeLabel = 'Pulso'; valLabel = `${bpm} bpm`;
    status = bpm > 100 ? 'Elevado' : (bpm < 60 ? 'Bajo' : 'Normal');
  }
  else if (reading.type === 'SPO2') { 
    const oxygen = reading.oxygen || reading.value;
    Icon = Drop; color = COLORS.blue; bg = COLORS.blueBg; typeLabel = 'Oxígeno'; valLabel = `${oxygen}%`;
    status = oxygen < 85 ? 'Emergencia' : (oxygen < 90 ? 'Crítico' : (oxygen < 95 ? 'Advertencia' : 'Normal'));
  }
  else if (reading.type === 'PRESSURE') { 
    const sys = reading.sys || reading.value?.sys;
    const dia = reading.dia || reading.value?.dia;
    Icon = Pulse; color = COLORS.purple; bg = COLORS.purpleBg; typeLabel = 'Presión'; valLabel = `${sys}/${dia}`;
    status = (sys >= 130 || dia >= 80) ? 'Elevado' : ((sys < 90 || dia < 60) ? 'Bajo' : 'Normal');
  }
  else if (reading.type === 'SOS') {
    Icon = Siren; color = COLORS.sos; bg = COLORS.sosBg; typeLabel = 'SOS'; valLabel = 'Emergencia';
    status = 'SOS';
  }

  const dateVal = reading.created_at || reading.timestamp;
  const _t = parseSafeDate(dateVal);
  const time = isNaN(_t) ? '--:--' : `${String(_t.getHours()).padStart(2, '0')}:${String(_t.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={styles.measRow}>
      <View style={[styles.measIconWrap, { backgroundColor: bg }]}>
        <Icon size={16} color={color} weight="fill" />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.measType}>{typeLabel} · <Text style={{fontWeight: '900'}}>{valLabel}</Text></Text>
        <Text style={styles.measTime}>{time}</Text>
      </View>
      <StatusBadge status={status} />
    </View>
  );
};

// 3. DayAccordion
const DayAccordion = ({ dayStr, readings, isInitiallyExpanded = false, onViewDay }) => {
  const [expanded, setExpanded] = useState(isInitiallyExpanded);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  // MOCK Pills Resume for the header
  const getMostRepresentative = () => {
    const bpmReadings = readings.filter(r => r.type === 'BPM');
    if (bpmReadings.length > 0) {
      const rep = bpmReadings[0];
      return `${rep.bpm || rep.value} bpm`;
    }
    return 'Resumen';
  };

  return (
    <View style={styles.accordionCard}>
      <TouchableOpacity style={styles.accHeader} onPress={toggle} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={styles.accTitle}>{dayStr}</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8}}>
            <Text style={styles.accSub}>{readings.length} mediciones</Text>
            <View style={styles.pill}><Text style={styles.pillText}>{getMostRepresentative()}</Text></View>
          </View>
        </View>
        <View style={styles.accRight}>
          <View style={styles.countBadge}><Text style={styles.countText}>{readings.length}</Text></View>
          {expanded ? <CaretUp size={16} color={COLORS.textMuted} /> : <CaretDown size={16} color={COLORS.textMuted} />}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.accBody}>
          {readings.slice(0, 5).map((r, i) => <MeasurementRow key={i} reading={r} />)}
          {readings.length > 5 && (
            <TouchableOpacity style={styles.seeMoreBtn} onPress={() => onViewDay(dayStr, readings)}>
              <Text style={styles.seeMoreText}>+ {readings.length - 5} más de este día</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export default function HistoryScreen({ readings: initialReadings, onBack, hideHeader = false, onRefresh }) {
  const [filter, setFilter] = useState('Todos');
  const [selectedDay, setSelectedDay] = useState(null);
  const [readings, setReadings] = useState(initialReadings || []);
  const [refreshing, setRefreshing] = useState(false);

  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const CARD_WIDTH = SCREEN_WIDTH - 40; // 20px padding per side
  const CHART_WIDTH = CARD_WIDTH - 32;  // 16px padding inside the card per side

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    } else {
      const latest = await loadReadings();
      setReadings(latest);
    }
    setRefreshing(false);
  }, [onRefresh]);

  useEffect(() => {
    if (initialReadings) {
      setReadings(initialReadings);
      return;
    }
    const fetchLatest = async () => {
      const latest = await loadReadings();
      setReadings(latest);
    };
    fetchLatest();
  }, [initialReadings]);

  // Calcular datos estadísticos para los gráficos (SOLO HOY por tiempo)
  const chartData = useMemo(() => {
    const today = parseSafeDate().toDateString();
    
    // Filtrar lecturas de hoy y ordenarlas cronológicamente
    const todaysReadings = readings
      .filter(r => {
        const dateVal = r.created_at || r.timestamp;
        return dateVal && parseSafeDate(dateVal).toDateString() === today;
      })
      .sort((a, b) => parseSafeDate(a.created_at || a.timestamp).getTime() - parseSafeDate(b.created_at || b.timestamp).getTime());

    const bpmData = []; const spo2Data = []; const sysData = []; const diaData = [];
    
    todaysReadings.forEach((r) => {
      const d = parseSafeDate(r.created_at || r.timestamp);
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      if (r.type === 'BPM') bpmData.push({ value: r.value || r.bpm, timeStr });
      else if (r.type === 'SPO2') spo2Data.push({ value: r.value || r.oxygen, timeStr });
      else if (r.type === 'PRESSURE') {
        sysData.push({ value: r.value?.sys || r.sys, timeStr });
        diaData.push({ value: r.value?.dia || r.dia, timeStr });
      }
    });

    const prepareChart = (dataArr) => {
      const fallback = { data: [{value: 0, label: '00:00', labelTextStyle: {color: COLORS.textMuted}}, {value: 0, label: 'Ahora', labelTextStyle: {color: COLORS.textMuted}}], indices: [0, 1], offset: 0, max: 10 };
      if (dataArr.length === 0) return fallback;
      if (dataArr.length === 1) return { data: [{value: dataArr[0].value, label: dataArr[0].timeStr, labelTextStyle: {color: COLORS.textMuted}}, {value: dataArr[0].value, label: 'Ahora', labelTextStyle: {color: COLORS.textMuted}}], indices: [0, 1], offset: Math.max(0, dataArr[0].value - 5), max: 10 };

      const indices = [
        0, 
        Math.floor(dataArr.length * 0.25),
        Math.floor(dataArr.length * 0.5),
        Math.floor(dataArr.length * 0.75),
        dataArr.length - 1
      ];
      const uniqueIndices = [...new Set(indices)].sort((a,b)=>a-b);
      
      let minVal = dataArr[0].value;
      let maxVal = dataArr[0].value;

      // Asignar colores intercalados a los labels para cuando sean scrollables
      const data = dataArr.map((d, i) => {
        if (d.value < minVal) minVal = d.value;
        if (d.value > maxVal) maxVal = d.value;
        return { 
          value: d.value, 
          label: d.timeStr,
          labelTextStyle: { color: i % 2 === 0 ? COLORS.textDark : COLORS.textMuted } 
        };
      });

      // Cálculo del Zoom Dinámico en Y
      const offset = Math.max(0, Math.floor(minVal) - 2);
      const diff = Math.ceil(maxVal) - offset;
      const max = diff < 10 ? 10 : diff + 2; // Asegurar un margen visual arriba

      return { data, indices: uniqueIndices, offset, max };
    };

    return { 
      bpmInfo: prepareChart(bpmData), 
      spo2Info: prepareChart(spo2Data), 
      sysInfo: prepareChart(sysData), 
      diaInfo: prepareChart(diaData) 
    };
  }, [readings]);

  // Filtrado y Ordenado (Descendente: más recientes primero)
  const filteredAndSortedReadings = useMemo(() => {
    let result = readings;
    if (filter === 'Pulso') result = readings.filter(r => r.type === 'BPM');
    else if (filter === 'Oxígeno') result = readings.filter(r => r.type === 'SPO2');
    else if (filter === 'Presión') result = readings.filter(r => r.type === 'PRESSURE');
    else if (filter === 'SOS') result = readings.filter(r => r.type === 'SOS');
    
    // Sort descending (newest to oldest)
    return [...result].sort((a, b) => {
      const dateA = parseSafeDate(a.created_at || a.timestamp || 0).getTime();
      const dateB = parseSafeDate(b.created_at || b.timestamp || 0).getTime();
      return dateB - dateA;
    });
  }, [readings, filter]);

  // Agrupar por día (preservando el orden descendente)
  const groupedByDayArray = useMemo(() => {
    const groups = {};
    const orderedKeys = [];
    filteredAndSortedReadings.forEach(r => {
      const dateVal = r.created_at || r.timestamp;
      const d = dateVal ? parseSafeDate(dateVal) : parseSafeDate();
      const today = parseSafeDate();
      const _months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      let dayStr = `${d.getDate()} ${_months[d.getMonth()]} ${d.getFullYear()}`;
      
      if (d.toDateString() === today.toDateString()) {
        dayStr = 'Hoy · ' + dayStr;
      } else if (parseSafeDate(today.setDate(today.getDate()-1)).toDateString() === d.toDateString()) {
        dayStr = 'Ayer · ' + dayStr;
      }

      if (!groups[dayStr]) {
        groups[dayStr] = [];
        orderedKeys.push(dayStr);
      }
      groups[dayStr].push(r);
    });
    return orderedKeys.map(key => ({ dayStr: key, readings: groups[key] }));
  }, [filteredAndSortedReadings]);

  // Chart Data Mockup (2 lines)
  const pulseData = [{value: 70},{value: 72},{value: 68},{value: 75},{value: 73}];
  const oxData = [{value: 96},{value: 97},{value: 95},{value: 98},{value: 96}];

  if (selectedDay) {
    const FullDayContainer = hideHeader ? View : SafeAreaView;
    return (
      <FullDayContainer style={styles.container}>
        {!hideHeader && <StatusBar barStyle="dark-content" backgroundColor={COLORS.header} />}
        
        {/* ── HEADER FULL DAY ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedDay(null)} style={{padding: 8, marginLeft: -8}}>
            <CaretLeft size={24} color={COLORS.textDark} weight="bold" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedDay.dayStr}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16, fontWeight: '600' }}>
            Todas las mediciones del día ({selectedDay.readings.length})
          </Text>
          {selectedDay.readings.map((r, i) => (
            <MeasurementRow key={i} reading={r} />
          ))}
          <View style={{height: 40}}/>
        </ScrollView>
      </FullDayContainer>
    );
  }

  const ContainerComponent = hideHeader ? View : SafeAreaView;

  return (
    <ContainerComponent style={styles.container}>
      {!hideHeader && (
        <>
          <StatusBar barStyle="dark-content" backgroundColor={COLORS.header} />
          {/* ── HEADER ── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={{padding: 8, marginLeft: -8}}>
              <CaretLeft size={24} color={COLORS.textDark} weight="bold" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Historial de mediciones</Text>
            <View style={{ width: 40 }} />
          </View>
        </>
      )}

      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── CHARTS INTELIGENTES ── */}
        <View style={{ marginBottom: 16 }}>
          {filter === 'Pulso' && (
            <LineChartCard title="Línea de Tiempo Detallada: Pulso" data={chartData.bpmInfo.data} yAxisOffset={chartData.bpmInfo.offset} maxValue={chartData.bpmInfo.max} lineColor="#DC2626" width={CHART_WIDTH} isScrollable={true} />
          )}

          {filter === 'Oxígeno' && (
            <LineChartCard title="Línea de Tiempo Detallada: Oxígeno" data={chartData.spo2Info.data} yAxisOffset={chartData.spo2Info.offset} maxValue={chartData.spo2Info.max} lineColor="#2563EB" width={CHART_WIDTH} isScrollable={true} />
          )}

          {filter === 'Presión' && (
            <LineChartCard title="Línea de Tiempo Detallada: Presión" data={chartData.sysInfo.data} data2={chartData.diaInfo.data} yAxisOffset={chartData.diaInfo.offset} maxValue={chartData.sysInfo.max + (chartData.sysInfo.offset - chartData.diaInfo.offset)} lineColor="#7C3AED" lineColor2="#C4B5FD" width={CHART_WIDTH} isScrollable={true} />
          )}
        </View>

        {/* ── CHIPS FILTRO ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          <FilterChip label="Todos" active={filter === 'Todos'} onPress={() => setFilter('Todos')} />
          <FilterChip label="Pulso" active={filter === 'Pulso'} onPress={() => setFilter('Pulso')} />
          <FilterChip label="Oxígeno" active={filter === 'Oxígeno'} onPress={() => setFilter('Oxígeno')} />
          <FilterChip label="Presión" active={filter === 'Presión'} onPress={() => setFilter('Presión')} />
          <FilterChip label="SOS" isSos active={filter === 'SOS'} onPress={() => setFilter('SOS')} />
        </ScrollView>

        {/* ── ACCORDIONS ── */}
        {groupedByDayArray.length === 0 ? (
          <Text style={{textAlign: 'center', color: COLORS.textMuted, marginTop: 40}}>No hay mediciones para mostrar.</Text>
        ) : (
          groupedByDayArray.map((group, index) => (
            <DayAccordion 
              key={index} 
              dayStr={group.dayStr} 
              readings={group.readings} 
              isInitiallyExpanded={index === 0}
              onViewDay={(dayStr, readings) => setSelectedDay({ dayStr, readings })} 
            />
          ))
        )}

        <View style={{height: 40}}/>
      </ScrollView>

    </ContainerComponent>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.header, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderColor: COLORS.borderDark
  },
  headerTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textDark },
  filterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  
  content: { padding: 20 },
  
  chartCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.border, padding: 16, marginBottom: 20, alignItems: 'center' },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendTxt: { fontSize: 8, color: COLORS.textMuted, fontWeight: '600' },

  chipsScroll: { gap: 8, paddingBottom: 24 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5 },
  chipText: { fontSize: 9, fontWeight: '700' },

  accordionCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
  accHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  accTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textDark, textTransform: 'capitalize' },
  accSub: { fontSize: 9, color: COLORS.textMuted },
  pill: { backgroundColor: COLORS.redBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 8, color: COLORS.red, fontWeight: '700' },
  accRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countBadge: { backgroundColor: COLORS.blueBg, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  countText: { color: COLORS.blue, fontSize: 10, fontWeight: '800' },

  accBody: { borderTopWidth: 0.5, borderColor: '#F3F4F6' },
  measRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderColor: '#F3F4F6', backgroundColor: '#F9FAFB' },
  measIconWrap: { width: 26, height: 26, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  measType: { fontSize: 10, color: COLORS.textDark },
  measTime: { fontSize: 8, color: COLORS.textMuted, marginTop: 2 },
  
  seeMoreBtn: { padding: 12, alignItems: 'center', backgroundColor: '#FFF' },
  seeMoreText: { color: COLORS.primary, fontSize: 10, fontWeight: '700' }
});
