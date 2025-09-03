import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Svg, Rect, Circle, Image } from '@react-pdf/renderer';
import { Job, JobStatus } from '@/app/lib/types';

// Define consistent STATUS_COLORS for PDF generation
const STATUS_COLORS: Record<JobStatus, string> = {
  pending: '#FFA500',
  waiting_sparepart: '#87CEEB',
  completed: '#008000',
  cancelled: '#FF0000',
  in_progress: '#9B59B6',
};

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
  jobsByTopic?: Array<{
    topic: string;
    count: number;
    percentage: string;
  }>;
  jobsByRoom?: Array<{
    room: string;
    count: number;
    percentage: string;
  }>;
  chartImages?: {
    pieChart?: string | null;
    barChart?: string | null;
    topicChart?: string | null;
    roomChart?: string | null;
  };
}

const ChartDashboardPDF: React.FC<ChartDashboardPDFProps> = ({
  jobs,
  selectedProperty,
  propertyName,
  jobStats,
  jobsByMonth,
  jobsByUser = [],
  jobsByTopic = [],
  jobsByRoom = [],
  chartImages = {},
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
          
          {/* Data Summary */}
          <View style={{ marginBottom: 15, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 }}>
            <Text style={{ fontSize: 10, color: '#374151', marginBottom: 5, fontWeight: 'bold' }}>
              Chart Data Summary:
            </Text>
            {jobStats.map((stat, index) => (
              <Text key={index} style={{ fontSize: 9, color: '#6b7280', marginBottom: 2 }}>
                {stat.name}: {stat.value} jobs ({stat.percentage}%) - Color: {stat.color}
              </Text>
            ))}
          </View>
          
          <View style={styles.chartContainer}>
            {/* Use captured pie chart image if available, otherwise show fallback SVG */}
            {chartImages.pieChart ? (
              <View style={{ alignItems: 'center', marginBottom: 15 }}>
                <Image 
                  src={chartImages.pieChart} 
                  style={{
                    width: 400,
                    height: 400,
                    objectFit: 'contain'
                  }}
                />
              </View>
            ) : (
              <View style={{ alignItems: 'center', marginBottom: 15 }}>
                {/* Fallback SVG pie chart */}
                <Svg style={{ width: 350, height: 350 }} viewBox="0 0 350 350">
                  {(() => {
                    const centerX = 175;
                    const centerY = 175;
                    const radius = 140;
                    let currentAngle = 0;
                    
                    const validStats = jobStats.filter(stat => {
                      const percentage = parseFloat(stat.percentage);
                      return percentage > 0 && stat.value > 0;
                    });
                    
                    console.log('Fallback SVG - Valid stats:', validStats);
                    
                    if (validStats.length === 0) {
                      return (
                        <Text x={centerX} y={centerY} style={{ fontSize: 12, fill: '#6b7280', textAnchor: 'middle' }}>
                          No data available
                        </Text>
                      );
                    }
                    
                    return validStats.map((stat, index) => {
                      const percentage = parseFloat(stat.percentage);
                      const angle = (percentage / 100) * 360;
                      const endAngle = currentAngle + angle;
                      
                      const statusKey = stat.name.toLowerCase().replace(/\s+/g, '_') as JobStatus;
                      const fillColor = STATUS_COLORS[statusKey] || '#8884d8';
                      
                      console.log(`Fallback SVG - Segment ${index}:`, {
                        name: stat.name,
                        percentage,
                        angle,
                        fillColor,
                        statusKey
                      });
                      
                      const startAngleRad = (currentAngle * Math.PI) / 180;
                      const endAngleRad = (endAngle * Math.PI) / 180;
                      
                      const startX = centerX + radius * Math.cos(startAngleRad);
                      const startY = centerY + radius * Math.sin(startAngleRad);
                      const endX = centerX + radius * Math.cos(endAngleRad);
                      const endY = centerY + radius * Math.sin(endAngleRad);
                      
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
                          key={`fallback-pie-${index}`}
                          d={path}
                          fill={fillColor}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      );
                    });
                  })()}
                </Svg>
              </View>
            )}
            
            {/* Chart Legend */}
            <View style={styles.chartLegend}>
              {jobStats.filter(stat => {
                const percentage = parseFloat(stat.percentage);
                return percentage > 0 && stat.value > 0;
              }).map((stat, index) => {
                // Use the consistent STATUS_COLORS mapping
                const statusKey = stat.name.toLowerCase().replace(/\s+/g, '_') as JobStatus;
                const legendColor = STATUS_COLORS[statusKey] || '#8884d8';
                
                return (
                  <View key={`legend-${index}`} style={styles.legendItem}>
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
            {/* Use captured bar chart image if available, otherwise show fallback */}
            {chartImages.barChart ? (
              <Image 
                src={chartImages.barChart} 
                style={{
                  width: 500,
                  height: 300,
                  marginBottom: 15,
                  alignSelf: 'center'
                }}
              />
            ) : (
              <View style={{ alignItems: 'center', marginBottom: 15 }}>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  Chart image not available
                </Text>
              </View>
            )}
            
            {/* Chart Legend */}
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: '#8884d8' }]} />
                <Text style={styles.legendText}>Total Jobs per Month</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Jobs by Topic Chart */}
        {jobsByTopic && jobsByTopic.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Jobs by Topic Chart</Text>
            <View style={styles.chartContainer}>
              {/* Use captured topic chart image if available, otherwise show fallback */}
              {chartImages.topicChart ? (
                <View style={{ alignItems: 'center', marginBottom: 15 }}>
                  <Image 
                    src={chartImages.topicChart} 
                    style={{
                      width: 500,
                      height: 300,
                      objectFit: 'contain'
                    }}
                  />
                </View>
              ) : (
                <View style={{ alignItems: 'center', marginBottom: 15 }}>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    Topic chart image not available
                  </Text>
                </View>
              )}
              
              {/* Chart Legend */}
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#8884d8' }]} />
                  <Text style={styles.legendText}>Job Count by Topic</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Jobs by Room Chart */}
        {jobsByRoom && jobsByRoom.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top 10 Rooms by Job Count</Text>
            <View style={styles.chartContainer}>
              {/* Use captured room chart image if available, otherwise show fallback */}
              {chartImages.roomChart ? (
                <View style={{ alignItems: 'center', marginBottom: 15 }}>
                  <Image 
                    src={chartImages.roomChart} 
                    style={{
                      width: 500,
                      height: 300,
                      objectFit: 'contain'
                    }}
                  />
                </View>
              ) : (
                <View style={{ alignItems: 'center', marginBottom: 15 }}>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    Room chart image not available
                  </Text>
                </View>
              )}
              
              {/* Chart Legend */}
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#82ca9d' }]} />
                  <Text style={styles.legendText}>Job Count by Room</Text>
                </View>
              </View>
            </View>
          </View>
        )}

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

        {/* Jobs by Topic Table */}
        {jobsByTopic && jobsByTopic.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Jobs by Topic</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Topic</Text>
                </View>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Count</Text>
                </View>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Percentage</Text>
                </View>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Visual</Text>
                </View>
              </View>
              {jobsByTopic.map((topicData, index) => (
                <View key={index} style={styles.tableRow}>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>{topicData.topic}</Text>
                  </View>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>{topicData.count}</Text>
                  </View>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>{topicData.percentage}%</Text>
                  </View>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>■</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Jobs by Room Table */}
        {jobsByRoom && jobsByRoom.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top 10 Rooms by Job Count</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Room</Text>
                </View>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Count</Text>
                </View>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Percentage</Text>
                </View>
                <View style={[styles.tableColQuarter, styles.tableHeader]}>
                  <Text style={styles.tableCell}>Visual</Text>
                </View>
              </View>
              {jobsByRoom.map((roomData, index) => (
                <View key={index} style={styles.tableRow}>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>{roomData.room}</Text>
                  </View>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>{roomData.count}</Text>
                  </View>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>{roomData.percentage}%</Text>
                  </View>
                  <View style={styles.tableColQuarter}>
                    <Text style={styles.tableCell}>■</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

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
