import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { Job, JobStatus, STATUS_COLORS } from '@/app/lib/types';

// Define styles for the PDF
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 10,
  },
  date: {
    fontSize: 12,
    color: '#9ca3af',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 15,
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    width: '30%',
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  chartSection: {
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 10,
  },
  chartDescription: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 15,
    lineHeight: 1.4,
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderColor: '#e5e7eb',
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderColor: '#e5e7eb',
  },
  tableCell: {
    margin: 'auto',
    marginTop: 5,
    fontSize: 10,
    padding: 8,
  },
  tableHeader: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    borderTop: '1px solid #e5e7eb',
    paddingTop: 15,
    fontSize: 8,
    color: '#9ca3af',
  },
});

interface ChartDashboardPDFProps {
  jobs: Job[];
  selectedProperty?: string | null;
  propertyName?: string;
  jobStats: Array<{
    name: string;
    value: number;
    color: string;
    percentage: string;
  }>;
  jobsByMonth: Array<{
    month: string;
    total: number;
    completed: number;
    pending: number;
    waiting_sparepart: number;
    in_progress: number;
    cancelled: number;
  }>;
}

const ChartDashboardPDF: React.FC<ChartDashboardPDFProps> = ({
  jobs,
  selectedProperty,
  propertyName,
  jobStats,
  jobsByMonth,
}) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(job => job.status === 'completed').length;
  const pendingJobs = jobs.filter(job => job.status === 'pending').length;
  const inProgressJobs = jobs.filter(job => job.status === 'in_progress').length;
  const waitingSparepartJobs = jobs.filter(job => job.status === 'waiting_sparepart').length;
  const cancelledJobs = jobs.filter(job => job.status === 'cancelled').length;

  const completionRate = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '0.0';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Chart Dashboard Report</Text>
          <Text style={styles.subtitle}>
            {propertyName ? `${propertyName} Dashboard` : 'Property Dashboard'}
          </Text>
          <Text style={styles.date}>Generated on: {currentDate}</Text>
        </View>

        {/* Summary Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalJobs}</Text>
              <Text style={styles.statLabel}>Total Jobs</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{completedJobs}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pendingJobs}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{inProgressJobs}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{waitingSparepartJobs}</Text>
              <Text style={styles.statLabel}>Waiting Parts</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{cancelledJobs}</Text>
              <Text style={styles.statLabel}>Cancelled</Text>
            </View>
          </View>
        </View>

        {/* Jobs by Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jobs by Status</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Status</Text>
              </View>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Count</Text>
              </View>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Percentage</Text>
              </View>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Color</Text>
              </View>
            </View>
            {jobStats.map((stat, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>{stat.name}</Text>
                </View>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>{stat.value}</Text>
                </View>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>{stat.percentage}%</Text>
                </View>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>■</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Jobs by Month */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jobs by Month (Last 12 Months)</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Month</Text>
              </View>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Total</Text>
              </View>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Completed</Text>
              </View>
              <View style={[styles.tableCol, styles.tableHeader]}>
                <Text style={styles.tableCell}>Pending</Text>
              </View>
            </View>
            {jobsByMonth.slice(-12).map((monthData, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>{monthData.month}</Text>
                </View>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>{monthData.total}</Text>
                </View>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>{monthData.completed}</Text>
                </View>
                <View style={styles.tableCol}>
                  <Text style={styles.tableCell}>{monthData.pending}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Additional Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Information</Text>
          <Text style={styles.chartDescription}>
            • Completion Rate: {completionRate}% of all jobs have been completed
          </Text>
          <Text style={styles.chartDescription}>
            • Property ID: {selectedProperty || 'Not specified'}
          </Text>
          <Text style={styles.chartDescription}>
            • Report covers all maintenance jobs in the system
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          This report was automatically generated by the PCMS Chart Dashboard system.
          For questions or support, please contact your system administrator.
        </Text>
      </Page>
    </Document>
  );
};

export default ChartDashboardPDF;
