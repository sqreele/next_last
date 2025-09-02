import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Svg, Rect, Circle } from '@react-pdf/renderer';
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
    width: '16.67%', // 100% / 6 columns for jobs by user table
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderColor: '#e5e7eb',
  },
  tableColQuarter: {
    width: '25%', // For 4-column tables like jobs by month
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
  chartContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  pieChart: {
    width: 200,
    height: 200,
    marginBottom: 15,
  },
  barChart: {
    width: 400,
    height: 200,
    marginBottom: 15,
  },
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 5,
  },
  legendColor: {
    width: 12,
    height: 12,
    marginRight: 5,
  },
  legendText: {
    fontSize: 8,
    color: '#374151',
  },
  simpleChart: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 10,
  },
  chartBar: {
    width: '45%',
    padding: 10,
    margin: 5,
    borderRadius: 5,
    textAlign: 'center',
  },
  chartBarText: {
    fontSize: 8,
    color: '#ffffff',
    fontWeight: 'bold',
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
  jobsByUser?: Array<{
    username: string;
    total: number;
    completed: number;
    pending: number;
    in_progress: number;
    waiting_sparepart: number;
    cancelled: number;
    completionRate: string;
  }>;
}

const ChartDashboardPDF: React.FC<ChartDashboardPDFProps> = ({
  jobs,
  selectedProperty,
  propertyName,
  jobStats,
  jobsByMonth,
  jobsByUser = [],
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

        {/* Pie Chart - Jobs by Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jobs by Status Chart</Text>
          
          {/* Debug: Display color information as text */}
          <View style={styles.section}>
            <Text style={styles.chartTitle}>Debug: Colors Used</Text>
            {jobStats.map((stat, index) => (
              <Text key={index} style={styles.chartDescription}>
                {stat.name}: {stat.value} ({stat.percentage}%) - Color: {stat.color || 'undefined'}
              </Text>
            ))}
          </View>
          
          <View style={styles.chartContainer}>
            {/* Pie Chart - Jobs by Status */}
            <Svg style={styles.pieChart} viewBox="0 0 200 200">
              {/* Create pie chart segments */}
              {(() => {
                const centerX = 100;
                const centerY = 100;
                const radius = 80;
                let currentAngle = 0;
                
                // Define fallback colors if stat.color is undefined
                const fallbackColors = ['#FFA500', '#87CEEB', '#008000', '#FF0000', '#9B59B6', '#FF6B6B', '#4ECDC4', '#45B7D1'];
                
                return jobStats.map((stat, index) => {
                  const percentage = parseFloat(stat.percentage);
                  if (percentage === 0) return null; // Skip segments with 0 value
                  
                  const angle = (percentage / 100) * 360;
                  const endAngle = currentAngle + angle;
                  
                  // Use stat.color if available, otherwise use fallback
                  const fillColor = stat.color || fallbackColors[index % fallbackColors.length];
                  
                  // Calculate arc coordinates for the pie segment
                  const startAngleRad = (currentAngle * Math.PI) / 180;
                  const endAngleRad = (endAngle * Math.PI) / 180;
                  
                  const startX = centerX + radius * Math.cos(startAngleRad);
                  const startY = centerY + radius * Math.sin(startAngleRad);
                  const endX = centerX + radius * Math.cos(endAngleRad);
                  const endY = centerY + radius * Math.sin(endAngleRad);
                  
                  // Create arc path
                  const largeArcFlag = angle > 180 ? 1 : 0;
                  const path = [
                    `M ${centerX} ${centerY}`,
                    `L ${startX} ${startY}`,
                    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                    'Z'
                  ].join(' ');
                  
                  currentAngle = endAngle;
                  
                  return (
                    <path
                      key={index}
                      d={path}
                      fill={fillColor}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  );
                });
              })()}
            </Svg>
            
            {/* Chart Legend */}
            <View style={styles.chartLegend}>
              {jobStats.map((stat, index) => {
                // Use stat.color if available, otherwise use fallback
                const fallbackColors = ['#FFA500', '#87CEEB', '#008000', '#FF0000', '#9B59B6', '#FF6B6B', '#4ECDC4', '#45B7D1'];
                const legendColor = stat.color || fallbackColors[index % fallbackColors.length];
                
                return (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: legendColor }]} />
                    <Text style={styles.legendText}>
                      {stat.name}: {stat.value} ({stat.percentage}%)
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Bar Chart - Jobs by Month */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jobs by Month Chart</Text>
          <View style={styles.chartContainer}>
            <Svg style={styles.barChart} viewBox="0 0 400 200">
              {/* Y-axis */}
              <line x1="50" y1="20" x2="50" y2="180" stroke="#e5e7eb" strokeWidth="1" />
              {/* X-axis */}
              <line x1="50" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1" />
              
              {/* Y-axis labels */}
              <Text x="30" y="25" style={{ fontSize: 8, fill: "#6b7280" }}>100</Text>
              <Text x="30" y="65" style={{ fontSize: 8, fill: "#6b7280" }}>75</Text>
              <Text x="30" y="105" style={{ fontSize: 8, fill: "#6b7280" }}>50</Text>
              <Text x="30" y="145" style={{ fontSize: 8, fill: "#6b7280" }}>25</Text>
              <Text x="30" y="185" style={{ fontSize: 8, fill: "#6b7280" }}>0</Text>
              
              {/* Bars for last 6 months */}
              {jobsByMonth.slice(-6).map((monthData, index) => {
                const barWidth = 40;
                const barSpacing = 10;
                const x = 60 + index * (barWidth + barSpacing);
                const maxValue = Math.max(...jobsByMonth.map(m => m.total));
                const barHeight = monthData.total > 0 ? (monthData.total / maxValue) * 140 : 0;
                const y = 180 - barHeight;
                
                return (
                  <View key={index}>
                    {/* Bar */}
                    <Rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      fill="#8884d8"
                      stroke="#ffffff"
                      strokeWidth="1"
                    />
                    
                    {/* Bar label */}
                    <Text
                      x={x + barWidth / 2}
                      y="195"
                      style={{ fontSize: 6, fill: "#374151" }}
                    >
                      {monthData.month.split(' ')[0]}
                    </Text>
                    
                    {/* Value label */}
                    <Text
                      x={x + barWidth / 2}
                      y={y - 5}
                      style={{ fontSize: 8, fill: "#374151" }}
                    >
                      {monthData.total}
                    </Text>
                  </View>
                );
              })}
            </Svg>
            
            {/* Chart Legend */}
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: '#8884d8' }]} />
                <Text style={styles.legendText}>Total Jobs per Month</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Jobs by Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jobs by Status</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Status</Text>
              </View>
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Count</Text>
              </View>
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Percentage</Text>
              </View>
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Color</Text>
              </View>
            </View>
            {jobStats.map((stat, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{stat.name}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{stat.value}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{stat.percentage}%</Text>
                </View>
                <View style={styles.tableColQuarter}>
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
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Month</Text>
              </View>
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Total</Text>
              </View>
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Completed</Text>
              </View>
              <View style={[styles.tableColQuarter, styles.tableHeader]}>
                <Text style={styles.tableCell}>Pending</Text>
              </View>
            </View>
            {jobsByMonth.slice(-12).map((monthData, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{monthData.month}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{monthData.total}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{monthData.completed}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{monthData.pending}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Jobs by User */}
        {jobsByUser && jobsByUser.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Jobs by User</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <View style={[styles.tableCol, styles.tableHeader]}>
                  <Text style={styles.tableCell}>User</Text>
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
                <View style={[styles.tableCol, styles.tableHeader]}>
                  <Text style={styles.tableCell}>In Progress</Text>
                </View>
                <View style={[styles.tableCol, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Completion Rate</Text>
                </View>
              </View>
              {jobsByUser.map((userData, index) => (
                <View key={index} style={styles.tableRow}>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCell}>{userData.username}</Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCell}>{userData.total}</Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCell}>{userData.completed}</Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCell}>{userData.pending}</Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCell}>{userData.in_progress}</Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCell}>{userData.completionRate}%</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

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
