import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Heart, Drop, Pulse, Clock, ClockCounterClockwise, Siren, MapPin, House, ChartLineUp, Funnel, Copy, BatteryWarning, ShieldCheck } from 'phosphor-react-native';

export const COLORS = {
  bg: '#F5F7FF',
  header: '#EEF2FF',
  border: '#E0E7FF',
  borderDark: '#C7D2FE',
  primary: '#4F46E5',
  textDark: '#1E3A8A',
  textMuted: '#9CA3AF',
  red: '#DC2626',
  redBg: '#FEF2F2',
  redBorder: '#FECACA',
  blue: '#2563EB',
  blueBg: '#EFF6FF',
  blueBorder: '#BFDBFE',
  purple: '#7C3AED',
  purpleBg: '#F5F3FF',
  purpleBorder: '#DDD6FE',
  green: '#10B981',
  greenBg: '#D1FAE5',
  amber: '#92400E',
  amberBg: '#FEF3C7',
  sos: '#991B1B',
  sosBg: '#FEE2E2',
};

// 1. StatusBadge
export const StatusBadge = ({ status }) => {
  let bg, textC;
  if (status === 'Normal' || status === 'Estable' || status === 'Vigilancia Activa') { bg = COLORS.greenBg; textC = '#065F46'; }
  else if (status === 'Elevado' || status === 'Bajo' || status === 'Advertencia') { bg = COLORS.amberBg; textC = COLORS.amber; }
  else { bg = COLORS.sosBg; textC = COLORS.sos; }

  return (
    <View style={[styles.badgeContainer, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: textC }]}>{status}</Text>
    </View>
  );
};

// 2. WatchBadge
export const WatchBadge = ({ isConnected, battery }) => {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isConnected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
    } else {
      anim.setValue(1);
    }
  }, [isConnected]);

  return (
    <View style={styles.watchBadge}>
      <Animated.View style={[
        styles.dot, 
        { backgroundColor: isConnected ? COLORS.green : COLORS.textMuted, opacity: anim }
      ]} />
      <Clock size={12} color={COLORS.textDark} weight="regular" />
      <Text style={styles.watchText}>
        {isConnected 
          ? `Reloj OK${battery !== undefined && battery !== null ? ` · ${battery}%` : ''}` 
          : 'Sin señal'}
      </Text>
    </View>
  );
};

// 3. VitalCard
export const VitalCard = ({ type, value, unit }) => {
  let Icon, color, bg, border;
  if (type === 'Pulso') { Icon = Heart; color = COLORS.red; bg = COLORS.redBg; border = COLORS.redBorder; }
  else if (type === 'Oxígeno') { Icon = Drop; color = COLORS.blue; bg = COLORS.blueBg; border = COLORS.blueBorder; }
  else { Icon = Pulse; color = COLORS.purple; bg = COLORS.purpleBg; border = COLORS.purpleBorder; }

  return (
    <View style={[styles.vitalCard, { backgroundColor: bg, borderColor: border }]}>
      <Icon size={20} color={color} weight="regular" />
      <Text style={styles.vitalLabel}>{type.toUpperCase()}</Text>
      <Text style={[styles.vitalValue, { color }]}>{value}</Text>
      <Text style={styles.vitalUnit}>{unit}</Text>
    </View>
  );
};

// 4. LineChartCard
export const LineChartCard = ({ title, status, data, data2, lineColor, lineColor2, width = 280, xAxisIndices, yAxisOffset, maxValue, isScrollable }) => {
  return (
    <View style={[styles.chartCard, { overflow: 'hidden' }]}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        {status && <StatusBadge status={status} />}
      </View>
      <View style={{ marginTop: 16, alignItems: 'center', overflow: 'hidden', width: '100%' }}>
        <LineChart
          data={data}
          data2={data2}
          hideDataPoints={false}
          thickness={2}
          thickness2={2}
          color={lineColor || COLORS.red}
          color2={lineColor2}
          dataPointsColor={lineColor || COLORS.red}
          dataPointsColor2={lineColor2}
          dataPointsRadius={3}
          customDataPoint={() => <View style={{width: 4, height: 4, backgroundColor: lineColor || COLORS.red, borderRadius: 2}} />}
          customDataPoint2={data2 ? () => <View style={{width: 4, height: 4, backgroundColor: lineColor2, borderRadius: 2}} /> : undefined}
          curved
          curveType="spline"
          width={width}
          height={120}
          yAxisTextStyle={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 'bold' }}
          xAxisLabelTextStyle={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 'bold', width: 40, textAlign: 'center' }}
          xAxisLabelIndices={isScrollable ? undefined : xAxisIndices}
          labelsExtraHeight={15}
          xAxisLabelsVerticalShift={5}
          yAxisColor={COLORS.borderDark}
          xAxisColor={COLORS.borderDark}
          hideRules={false}
          rulesColor={COLORS.border}
          rulesType="dashed"
          yAxisOffset={yAxisOffset || 0}
          maxValue={maxValue}
          noOfSections={4}
          spacing={isScrollable ? 45 : (width / Math.max(1, data.length))}
          initialSpacing={20}
          endSpacing={20}
          scrollEnabled={isScrollable || false}
          scrollToEnd={isScrollable || false}
          scrollToIndex={isScrollable ? data.length - 1 : undefined}
          hideAxesAndRules={false}
        />
      </View>
    </View>
  );
};

// 5. ActionButton
export const ActionButton = ({ type, onPress }) => {
  let Icon, color, bg, border;
  if (type === 'Pulso') { Icon = Heart; color = COLORS.red; bg = COLORS.redBg; border = COLORS.redBorder; }
  else if (type === 'Oxígeno') { Icon = Drop; color = COLORS.blue; bg = COLORS.blueBg; border = COLORS.blueBorder; }
  else { Icon = Pulse; color = COLORS.purple; bg = COLORS.purpleBg; border = COLORS.purpleBorder; }

  return (
    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: bg, borderColor: border }]} onPress={onPress}>
      <Icon size={22} color={color} weight="regular" />
      <Text style={[styles.actionText, { color }]}>{type}</Text>
    </TouchableOpacity>
  );
};

// 6. SOSButton
export const SOSButton = ({ onPress }) => (
  <TouchableOpacity style={styles.sosBtn} onPress={onPress}>
    <Siren size={20} color="#BFDBFE" weight="regular" />
    <Text style={styles.sosText}>SOS · EMERGENCIA</Text>
  </TouchableOpacity>
);

// 7. PatientCard (Caregiver)
export const PatientCard = ({ name, age, isAutoMode, bpm, spo2, pressure, battery }) => {
  const initials = name ? name.split(' ').map(n=>n[0]).join('').substring(0,2) : 'PT';
  return (
    <View style={styles.patientCard}>
      <View style={styles.patientHeader}>
        <View style={styles.patientAvatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={{flex: 1, marginLeft: 12}}>
          <Text style={styles.patientName}>{name}</Text>
          <Text style={styles.patientAge}>{age} años{battery !== undefined && battery !== null ? ` · 🔋 ${battery}%` : ''}</Text>
        </View>
        {isAutoMode && (
          <View style={[styles.badgeContainer, { backgroundColor: COLORS.greenBg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <ShieldCheck size={10} color="#065F46" weight="fill" />
            <Text style={[styles.badgeText, { color: '#065F46' }]}>Vigilancia Activa</Text>
          </View>
        )}
      </View>
      <View style={styles.patientGrid}>
        <View style={[styles.patientCell, { backgroundColor: COLORS.redBg }]}>
          <Heart size={16} color={COLORS.red} weight="fill" />
          <Text style={[styles.cellValue, { color: COLORS.red }]}>{bpm || '--'}</Text>
          <Text style={styles.cellUnit}>bpm</Text>
        </View>
        <View style={[styles.patientCell, { backgroundColor: COLORS.blueBg }]}>
          <Drop size={16} color={COLORS.blue} weight="fill" />
          <Text style={[styles.cellValue, { color: COLORS.blue }]}>{spo2 || '--'}</Text>
          <Text style={styles.cellUnit}>%</Text>
        </View>
        <View style={[styles.patientCell, { backgroundColor: COLORS.purpleBg }]}>
          <Pulse size={16} color={COLORS.purple} weight="fill" />
          <Text style={[styles.cellValue, { color: COLORS.purple }]}>{pressure || '--/--'}</Text>
          <Text style={styles.cellUnit}>mmHg</Text>
        </View>
      </View>
    </View>
  );
};

// 8. AlertFeedItem (Caregiver)
export const AlertFeedItem = ({ type, value, time, status }) => {
  let Icon, color, bg;
  if (type.includes('Pulso') || type.includes('BPM')) { Icon = Heart; color = COLORS.red; bg = COLORS.redBg; }
  else if (type.includes('Oxígeno') || type.includes('SpO2')) { Icon = Drop; color = COLORS.blue; bg = COLORS.blueBg; }
  else if (type.includes('SOS')) { Icon = Siren; color = COLORS.sos; bg = COLORS.sosBg; }
  else { Icon = Pulse; color = COLORS.purple; bg = COLORS.purpleBg; }

  return (
    <View style={styles.feedItem}>
      <View style={[styles.feedIconWrap, { backgroundColor: bg }]}>
        <Icon size={20} color={color} weight="fill" />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.feedTitle}>{type} · <Text style={{ fontWeight: '800' }}>{value}</Text></Text>
        <Text style={styles.feedTime}>{time}</Text>
      </View>
      <StatusBadge status={status} />
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  watchBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.border, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  watchText: { fontSize: 8, fontWeight: '700', color: COLORS.textDark },
  vitalCard: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginHorizontal: 4 },
  vitalLabel: { fontSize: 8, color: COLORS.textMuted, marginTop: 4, fontWeight: '600' },
  vitalValue: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  vitalUnit: { fontSize: 7, color: COLORS.textMuted },
  chartCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.border, padding: 16, marginBottom: 16 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartTitle: { fontSize: 10, fontWeight: '700', color: COLORS.textDark },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', marginHorizontal: 4 },
  actionText: { fontSize: 9, fontWeight: '700', marginTop: 6, textTransform: 'uppercase' },
  sosBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.textDark, borderRadius: 14, paddingVertical: 16, gap: 8 },
  sosText: { color: '#FFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  
  patientCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.border, padding: 16, marginBottom: 20 },
  patientHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  patientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.header, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  patientName: { fontSize: 13, fontWeight: '800', color: COLORS.textDark },
  patientAge: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  patientGrid: { flexDirection: 'row', gap: 8 },
  patientCell: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', justifyContent: 'center' },
  cellValue: { fontSize: 14, fontWeight: '900', marginTop: 4 },
  cellUnit: { fontSize: 7, color: COLORS.textMuted },
  
  feedItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderColor: COLORS.bg },
  feedIconWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  feedTitle: { fontSize: 11, color: COLORS.textDark, fontWeight: '600' },
  feedTime: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 }
});
