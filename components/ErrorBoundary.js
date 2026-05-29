import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>¡Algo salió mal!</Text>
            <Text style={styles.subtitle}>
              La aplicación encontró un error al intentar mostrar esta pantalla.
            </Text>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {this.state.error && this.state.error.toString()}
              </Text>
            </View>
            <Text style={styles.stackLabel}>Stack Trace:</Text>
            <View style={styles.errorBox}>
              <Text style={styles.stackText}>
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEF2F2',
  },
  content: {
    padding: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#991B1B',
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 24,
  },
  errorText: {
    color: '#DC2626',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  stackLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7F1D1D',
    marginBottom: 8,
  },
  stackText: {
    color: '#450A0A',
    fontFamily: 'monospace',
    fontSize: 10,
  },
});
