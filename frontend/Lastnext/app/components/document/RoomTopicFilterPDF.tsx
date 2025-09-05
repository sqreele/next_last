import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Job, Topic, Room } from '../../lib/types';

interface RoomTopicData {
  room: Room;
  topics: Array<{
    topic: Topic;
    count: number;
    percentage: string;
  }>;
  totalJobs: number;
}

interface TopicRoomData {
  topic: Topic;
  rooms: Array<{
    room: Room;
    count: number;
    percentage: string;
  }>;
  totalJobs: number;
}

interface RoomTopicFilterPDFProps {
  roomTopicData: RoomTopicData[];
  topicRoomData: TopicRoomData[];
  searchTerm: string;
  selectedTopic: string;
  selectedRoom: string;
  selectedUser: string;
  selectedProperty: string;
  totalJobs: number;
}

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
    fontSize: 10,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 5,
  },
  date: {
    fontSize: 10,
    color: '#6b7280',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    margin: 5,
    padding: 15,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 5,
  },
  filters: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  filterLabel: {
    fontWeight: 'bold',
    width: 100,
    color: '#374151',
  },
  filterValue: {
    color: '#6b7280',
  },
  table: {
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8,
  },
  tableHeader: {
    backgroundColor: '#f9fafb',
    fontWeight: 'bold',
  },
  tableCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  tableColHalf: {
    flex: 2,
    paddingHorizontal: 8,
  },
  tableColQuarter: {
    flex: 0.5,
    paddingHorizontal: 8,
  },
  tableCell: {
    fontSize: 9,
    color: '#374151',
  },
  roomCard: {
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  roomTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  roomType: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 8,
  },
  topicList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  topicBadge: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 5,
    marginBottom: 5,
    borderRadius: 4,
    fontSize: 8,
  },
  topicText: {
    fontSize: 8,
    color: '#374151',
  },
  pageBreak: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
  },
});

const RoomTopicFilterPDF: React.FC<RoomTopicFilterPDFProps> = ({
  roomTopicData,
  topicRoomData,
  searchTerm,
  selectedTopic,
  selectedRoom,
  selectedUser,
  selectedProperty,
  totalJobs,
}) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const filteredJobs = roomTopicData.reduce((sum, room) => sum + room.totalJobs, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Room-Topic Filter Report</Text>
            <Text style={styles.subtitle}>
              Analysis of rooms and their associated maintenance topics
            </Text>
          </View>
          <Text style={styles.date}>{currentDate}</Text>
        </View>

        {/* Summary Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary Statistics</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{totalJobs}</Text>
              <Text style={styles.summaryLabel}>Total Jobs</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{roomTopicData.length}</Text>
              <Text style={styles.summaryLabel}>Rooms with Jobs</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{topicRoomData.length}</Text>
              <Text style={styles.summaryLabel}>Topics with Jobs</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{filteredJobs}</Text>
              <Text style={styles.summaryLabel}>Filtered Jobs</Text>
            </View>
          </View>
        </View>

        {/* Applied Filters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Applied Filters</Text>
          <View style={styles.filters}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Search Term:</Text>
              <Text style={styles.filterValue}>{searchTerm || 'None'}</Text>
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Selected Topic:</Text>
              <Text style={styles.filterValue}>
                {selectedTopic === 'all' ? 'All Topics' : `Topic ID: ${selectedTopic}`}
              </Text>
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Selected Room:</Text>
              <Text style={styles.filterValue}>
                {selectedRoom === 'all' ? 'All Rooms' : `Room ID: ${selectedRoom}`}
              </Text>
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Selected User:</Text>
              <Text style={styles.filterValue}>
                {selectedUser === 'all' ? 'All Users' : `User ID: ${selectedUser}`}
              </Text>
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Selected Property:</Text>
              <Text style={styles.filterValue}>
                {selectedProperty === 'all' ? 'All Properties' : `Property ID: ${selectedProperty}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Rooms by Topics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rooms by Topics</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColHalf}>
                <Text style={styles.tableCell}>Room</Text>
              </View>
              <View style={styles.tableColQuarter}>
                <Text style={styles.tableCell}>Type</Text>
              </View>
              <View style={styles.tableColQuarter}>
                <Text style={styles.tableCell}>Total Jobs</Text>
              </View>
              <View style={styles.tableColHalf}>
                <Text style={styles.tableCell}>Top Topics</Text>
              </View>
            </View>
            {roomTopicData.slice(0, 20).map((roomData, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.tableColHalf}>
                  <Text style={styles.tableCell}>{roomData.room.name}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{roomData.room.room_type}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{roomData.totalJobs}</Text>
                </View>
                <View style={styles.tableColHalf}>
                  <Text style={styles.tableCell}>
                    {roomData.topics.slice(0, 3).map(t => t.topic.title).join(', ')}
                    {roomData.topics.length > 3 && ` (+${roomData.topics.length - 3} more)`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Detailed Room Information */}
        <View style={styles.pageBreak} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detailed Room Information</Text>
          {roomTopicData.slice(0, 10).map((roomData, index) => (
            <View key={index} style={styles.roomCard}>
              <Text style={styles.roomTitle}>
                {roomData.room.name} ({roomData.room.room_type})
              </Text>
              <Text style={styles.roomType}>
                Total Jobs: {roomData.totalJobs}
              </Text>
              <Text style={{ fontSize: 10, marginBottom: 5, fontWeight: 'bold' }}>
                Topics in this room:
              </Text>
              <View style={styles.topicList}>
                {roomData.topics.map((topicData, topicIndex) => (
                  <View key={topicIndex} style={styles.topicBadge}>
                    <Text style={styles.topicText}>
                      {topicData.topic.title} ({topicData.count})
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </Page>

      {/* Second Page - Topics by Rooms */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Topics by Rooms</Text>
            <Text style={styles.subtitle}>
              Analysis of topics and their associated rooms
            </Text>
          </View>
          <Text style={styles.date}>{currentDate}</Text>
        </View>

        {/* Topics by Rooms Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Topics by Rooms</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColHalf}>
                <Text style={styles.tableCell}>Topic</Text>
              </View>
              <View style={styles.tableColQuarter}>
                <Text style={styles.tableCell}>Description</Text>
              </View>
              <View style={styles.tableColQuarter}>
                <Text style={styles.tableCell}>Total Jobs</Text>
              </View>
              <View style={styles.tableColHalf}>
                <Text style={styles.tableCell}>Top Rooms</Text>
              </View>
            </View>
            {topicRoomData.slice(0, 20).map((topicData, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.tableColHalf}>
                  <Text style={styles.tableCell}>{topicData.topic.title}</Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>
                    {topicData.topic.description || 'No description'}
                  </Text>
                </View>
                <View style={styles.tableColQuarter}>
                  <Text style={styles.tableCell}>{topicData.totalJobs}</Text>
                </View>
                <View style={styles.tableColHalf}>
                  <Text style={styles.tableCell}>
                    {topicData.rooms.slice(0, 3).map(r => r.room.name).join(', ')}
                    {topicData.rooms.length > 3 && ` (+${topicData.rooms.length - 3} more)`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Detailed Topic Information */}
        <View style={styles.pageBreak} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detailed Topic Information</Text>
          {topicRoomData.slice(0, 10).map((topicData, index) => (
            <View key={index} style={styles.roomCard}>
              <Text style={styles.roomTitle}>{topicData.topic.title}</Text>
              <Text style={styles.roomType}>
                {topicData.topic.description || 'No description available'}
              </Text>
              <Text style={styles.roomType}>
                Total Jobs: {topicData.totalJobs}
              </Text>
              <Text style={{ fontSize: 10, marginBottom: 5, fontWeight: 'bold' }}>
                Rooms with this topic:
              </Text>
              <View style={styles.topicList}>
                {topicData.rooms.map((roomData, roomIndex) => (
                  <View key={roomIndex} style={styles.topicBadge}>
                    <Text style={styles.topicText}>
                      {roomData.room.name} ({roomData.count})
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
};

export default RoomTopicFilterPDF;
