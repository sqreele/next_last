'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useProperties } from '../../../lib/stores/mainStore';
import { useJobsData } from '../../../lib/hooks/useJobsData';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Search, Filter, Download, RefreshCw } from 'lucide-react';
import { Job, Topic, Room, User, Property } from '../../../lib/types';
import { downloadPdf } from '../../../lib/pdfUtils';
import { generatePdfBlob } from '../../../lib/pdfRenderer';
import { useSession } from '../../../lib/session.client';
import { fetchUsers, fetchUsersByProperty, fetchTopics, fetchRooms } from '../../../lib/data.server';
import { useDetailedUsers } from '../../../lib/hooks/useDetailedUsers';
import RoomTopicFilterPDF from '../../../components/document/RoomTopicFilterPDF';

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

const RoomTopicFilterPage = () => {
  const { userProfile, isAuthenticated } = useUser();
  const { properties: allProperties } = useProperties();
  const { data: session, status: sessionStatus } = useSession();
  const { users: detailedUsers, loading: detailedUsersLoading } = useDetailedUsers();
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Debug property selection
  useEffect(() => {
    console.log('Property selection changed:', selectedProperty);
  }, [selectedProperty]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Use backend filtering for jobs
  const { jobs: allJobs, isLoading: jobsLoading, refreshJobs } = useJobsData({
    propertyId: selectedProperty !== 'all' ? selectedProperty : null,
    filters: {
      user_id: selectedUser !== 'all' ? selectedUser : null
    }
  });

  // Refresh jobs when user or property selection changes
  useEffect(() => {
    if (selectedUser || selectedProperty) {
      refreshJobs();
    }
  }, [selectedUser, selectedProperty, refreshJobs]);

  // Fetch real data from APIs
  useEffect(() => {
    console.log('useEffect triggered with session:', !!session, 'accessToken:', !!session?.user?.accessToken);
    
    const fetchRealData = async () => {
      // Check authentication status
      if (sessionStatus === 'loading') {
        // Still loading, wait
        return;
      }
      
      if (sessionStatus === 'unauthenticated' || !session?.user?.accessToken) {
        console.log('No access token available, user not authenticated');
        setAuthError('Please sign in to view this page');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        console.log('Starting data fetch with selectedProperty:', selectedProperty);
        
        // Fetch topics and rooms (rooms filtered by property when selected)
        const topics = await fetchTopics(session.user.accessToken);
        let rooms: Room[] = [];
        if (selectedProperty && selectedProperty !== 'all') {
          try {
            const res = await fetch(`/api/rooms/?property=${encodeURIComponent(selectedProperty)}`, { method: 'GET' });
            if (res.ok) {
              const data = await res.json();
              rooms = Array.isArray(data) ? data : (data?.results ?? []);
            } else {
              console.warn('Rooms API returned non-OK status for property filter, falling back to all rooms:', res.status);
              rooms = await fetchRooms(session.user.accessToken);
            }
          } catch (e) {
            console.warn('Rooms API request failed, falling back to all rooms:', e);
            rooms = await fetchRooms(session.user.accessToken);
          }
        } else {
          rooms = await fetchRooms(session.user.accessToken);
        }

        setAllTopics(topics);
        setAllRooms(rooms);
        
        // Use detailed users from the hook (they are already fetched)
        let users: User[] = [];
        if (detailedUsers && detailedUsers.length > 0) {
          console.log('Using detailed users from hook, count:', detailedUsers.length);
          console.log('Sample user data:', detailedUsers[0]);
          
          // Transform detailed users to User format and filter by property
          const allUsers = detailedUsers.map((user: any) => ({
            id: user.id.toString(),
            username: user.username,
            email: user.email,
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            positions: user.positions || '',
            profile_image: user.profile_image,
            properties: user.properties || [],
            accessToken: '',
            refreshToken: '',
            created_at: user.created_at
          }));
          
          console.log('Transformed users sample:', allUsers[0]);
          console.log('Selected property:', selectedProperty);
          
          // Filter users by selected property
          if (selectedProperty === 'all') {
            users = allUsers;
            console.log(`Using all ${users.length} users (no property filter)`);
          } else {
            // Filter users who have the selected property
            users = allUsers.filter(user => 
              user.properties && user.properties.some((prop: any) => {
                const pid = (prop && typeof prop === 'object')
                  ? (prop.property_id ?? prop.id)
                  : prop;
                return String(pid) === String(selectedProperty);
              })
            );
            console.log(`Filtered to ${users.length} users for property ${selectedProperty}`);
          }
        } else {
          console.log('No detailed users available, using fallback fetch');
          // Fallback to the old method
          users = await fetchUsers(session.user.accessToken);
        }

        // Ensure unique users by filtering duplicates
        const uniqueUsers = users.filter((user, index, self) => 
          index === self.findIndex(u => u.id === user.id)
        );
        setAllUsers(uniqueUsers);
        
        console.log('Fetched real data:', {
          users: uniqueUsers.length,
          topics: topics.length,
          rooms: rooms.length,
          selectedProperty
        });
      } catch (error) {
        console.error('Error fetching real data:', error);
        // Set empty arrays as fallback
        setAllUsers([]);
        setAllTopics([]);
        setAllRooms([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRealData();
  }, [session?.user?.accessToken, sessionStatus, selectedProperty, detailedUsers]);

  // Process room-topic data
  const roomTopicData = useMemo(() => {
    if (allJobs.length === 0) return [];

    const roomMap = new Map<string, RoomTopicData>();

    // Process each job
    allJobs.forEach(job => {
      if (job.rooms && job.rooms.length > 0 && job.topics && job.topics.length > 0) {
        job.rooms.forEach((room: any) => {
          const roomKey = `${room.room_id}-${room.name}`;
          
          if (!roomMap.has(roomKey)) {
            roomMap.set(roomKey, {
              room,
              topics: [],
              totalJobs: 0
            });
          }

          const roomData = roomMap.get(roomKey)!;
          roomData.totalJobs++;

          // Process topics for this room
          job.topics?.forEach((topic: any) => {
            const existingTopic = roomData.topics.find(t => t.topic.id === topic.id);
            if (existingTopic) {
              existingTopic.count++;
            } else {
              roomData.topics.push({
                topic,
                count: 1,
                percentage: '0'
              });
            }
          });
        });
      }
    });

    // Calculate percentages and sort
    const result = Array.from(roomMap.values()).map(roomData => {
      roomData.topics.forEach(topicData => {
        topicData.percentage = ((topicData.count / roomData.totalJobs) * 100).toFixed(1);
      });
      roomData.topics.sort((a, b) => b.count - a.count);
      return roomData;
    });

    return result.sort((a, b) => b.totalJobs - a.totalJobs);
  }, [allJobs]);

  // Process topic-room data (reverse view)
  const topicRoomData = useMemo(() => {
    if (allJobs.length === 0) return [];

    const topicMap = new Map<string, TopicRoomData>();

    // Process each job
    allJobs.forEach(job => {
      if (job.topics && job.topics.length > 0 && job.rooms && job.rooms.length > 0) {
        job.topics.forEach((topic: any) => {
          const topicKey = `${topic.id}-${topic.title}`;
          
          if (!topicMap.has(topicKey)) {
            topicMap.set(topicKey, {
              topic,
              rooms: [],
              totalJobs: 0
            });
          }

          const topicData = topicMap.get(topicKey)!;
          topicData.totalJobs++;

          // Process rooms for this topic
          job.rooms?.forEach((room: any) => {
            const existingRoom = topicData.rooms.find(r => r.room.room_id === room.room_id);
            if (existingRoom) {
              existingRoom.count++;
            } else {
              topicData.rooms.push({
                room,
                count: 1,
                percentage: '0'
              });
            }
          });
        });
      }
    });

    // Calculate percentages and sort
    const result = Array.from(topicMap.values()).map(topicData => {
      topicData.rooms.forEach(roomData => {
        roomData.percentage = ((roomData.count / topicData.totalJobs) * 100).toFixed(1);
      });
      topicData.rooms.sort((a, b) => b.count - a.count);
      return topicData;
    });

    return result.sort((a, b) => b.totalJobs - a.totalJobs);
  }, [allJobs]);

  // Filter data based on search and selections
  const filteredRoomTopicData = useMemo(() => {
    let filtered = roomTopicData;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(roomData =>
        roomData.room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        roomData.room.room_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        roomData.topics.some(topicData => 
          topicData.topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          topicData.topic.description?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Filter by selected topic
    if (selectedTopic !== 'all') {
      filtered = filtered.filter(roomData =>
        roomData.topics.some(topicData => topicData.topic.id.toString() === selectedTopic)
      );
    }

    return filtered;
  }, [roomTopicData, searchTerm, selectedTopic]);

  const filteredTopicRoomData = useMemo(() => {
    let filtered = topicRoomData;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(topicData =>
        topicData.topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        topicData.topic.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by selected room
    if (selectedRoom !== 'all') {
      filtered = filtered.filter(topicData =>
        topicData.rooms.some(roomData => roomData.room.room_id.toString() === selectedRoom)
      );
    }

    return filtered;
  }, [topicRoomData, searchTerm, selectedRoom]);

  // Chart data for room-topic visualization
  const roomTopicChartData = useMemo(() => {
    return filteredRoomTopicData.slice(0, 10).map(roomData => ({
      room: roomData.room.name,
      totalJobs: roomData.totalJobs,
      topTopic: roomData.topics[0]?.topic.title || 'No Topics',
      topTopicCount: roomData.topics[0]?.count || 0
    }));
  }, [filteredRoomTopicData]);

  const topicRoomChartData = useMemo(() => {
    return filteredTopicRoomData.slice(0, 10).map(topicData => ({
      topic: topicData.topic.title,
      totalJobs: topicData.totalJobs,
      topRoom: topicData.rooms[0]?.room.name || 'No Rooms',
      topRoomCount: topicData.rooms[0]?.count || 0
    }));
  }, [filteredTopicRoomData]);

  // PDF export function
  const handleExportPDF = async () => {
    if (isGeneratingPDF) return;

    try {
      setIsGeneratingPDF(true);
      
      const pdfContent = (
        <RoomTopicFilterPDF
          roomTopicData={filteredRoomTopicData}
          topicRoomData={filteredTopicRoomData}
          searchTerm={searchTerm}
          selectedTopic={selectedTopic}
          selectedRoom={selectedRoom}
          selectedUser={selectedUser}
          selectedProperty={selectedProperty}
          totalJobs={allJobs.length}
        />
      );

      const pdfBlob = await generatePdfBlob(pdfContent);
      downloadPdf(pdfBlob, `room-topic-filter-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error: any) {
      alert(`Failed to generate PDF: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Show authentication error if not authenticated
  if (authError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Authentication Required</h2>
            <p className="text-red-600 mb-4">{authError}</p>
            <Button 
              onClick={() => window.location.href = '/auth/login'}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (jobsLoading || isLoading || detailedUsersLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading room-topic data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header - Mobile Responsive */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Room-Topic Filter</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
            Analyze which rooms have jobs for specific topics and vice versa
          </p>
        </div>
        <Button 
          onClick={handleExportPDF} 
          disabled={isGeneratingPDF}
          className="flex items-center gap-2 w-full sm:w-auto"
          size="sm"
        >
          {isGeneratingPDF ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Export PDF</span>
          <span className="sm:hidden">Export</span>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search rooms or topics..."
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {allTopics.map((topic, index) => (
                  <SelectItem key={`topic-${topic.id}-${index}`} value={topic.id.toString()}>
                    {topic.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by room" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rooms</SelectItem>
                {allRooms.map((room, index) => (
                  <SelectItem key={`room-${room.room_id}-${index}`} value={room.room_id.toString()}>
                    {room.name} ({room.room_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {allUsers.length > 0 ? (
                  allUsers.map((user, index) => {
                    // Determine display name based on available data
                    let displayName = user.username;
                    if (user.first_name && user.last_name) {
                      displayName = `${user.first_name} ${user.last_name}`;
                    } else if (user.first_name) {
                      displayName = user.first_name;
                    }
                    
                    // Determine role/position
                    let roleInfo = user.positions || user.email || 'No role';
                    
                    // Clean up Auth0 usernames for better display
                    if (user.username.includes('auth0_') || user.username.includes('google-oauth2_')) {
                      displayName = displayName.replace(/^(auth0_|google-oauth2_)/, '');
                    }
                    
                    return (
                      <SelectItem key={`user-${user.id}-${index}`} value={user.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {displayName}
                          </span>
                          <span className="text-sm text-gray-500">
                            {roleInfo}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })
                ) : (
                  <SelectItem value="no-users" disabled>
                    No users available for selected property
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {allProperties.length > 0 ? (
                  allProperties.map((property, index) => (
                    <SelectItem key={`property-${property.property_id}-${index}`} value={String(property.property_id)}>
                      {property.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-properties" disabled>
                    No properties available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Check if there's no data */}
      {allJobs.length === 0 && !jobsLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-gray-500">
              <p className="text-lg font-medium mb-2">No jobs data available</p>
              <p className="text-sm">There are no jobs to display for the selected filters.</p>
              <p className="text-sm mt-2">Try selecting different filters or check back later.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-xl sm:text-2xl font-bold">{allJobs.length}</div>
            <div className="text-xs sm:text-sm text-gray-600">Total Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-xl sm:text-2xl font-bold">{filteredRoomTopicData.length}</div>
            <div className="text-xs sm:text-sm text-gray-600">Rooms with Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-xl sm:text-2xl font-bold">{filteredTopicRoomData.length}</div>
            <div className="text-xs sm:text-sm text-gray-600">Topics with Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-xl sm:text-2xl font-bold">
              {filteredRoomTopicData.reduce((sum, room) => sum + room.totalJobs, 0)}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">Filtered Jobs</div>
          </CardContent>
        </Card>
      </div>

      {/* Property-based User Statistics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
            User Statistics by Property
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl sm:text-3xl font-bold text-blue-600">{allUsers.length}</div>
              <div className="text-xs sm:text-sm text-gray-600">
                {selectedProperty === 'all' ? 'Total Users' : `Users in Selected Property`}
              </div>
              <div className="text-xs text-gray-500 mt-1 hidden sm:block">
                {selectedProperty === 'all' 
                  ? 'All users across all properties' 
                  : `Filtered by ${allProperties.find(p => String(p.property_id) === String(selectedProperty))?.name || 'Unknown Property'}`
                }
              </div>
            </div>
            <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg">
              <div className="text-2xl sm:text-3xl font-bold text-green-600">
                {allUsers.filter(user => user.first_name && user.last_name).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">Users with Full Names</div>
            </div>
            <div className="text-center p-3 sm:p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl sm:text-3xl font-bold text-purple-600">
                {allUsers.filter(user => user.positions && user.positions.trim() !== '').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">Users with Assigned Positions</div>
            </div>
          </div>
          
          {/* Property Breakdown */}
          {selectedProperty === 'all' && detailedUsers && detailedUsers.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <h4 className="font-medium text-sm text-gray-700 mb-3">Users by Property:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {allProperties.map(property => {
                  const usersInProperty = detailedUsers.filter((user: any) => 
                    user.properties && user.properties.some((prop: any) => {
                      const pid = (prop && typeof prop === 'object')
                        ? (prop.property_id ?? prop.id)
                        : prop;
                      return String(pid) === String(property.property_id);
                    })
                  );
                  return (
                    <div key={String(property.property_id)} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">{property.name}</span>
                        <span className="text-lg font-bold text-blue-600">{usersInProperty.length}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {usersInProperty.map((user: any) => user.username).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Debug Information */}
          <div className="mt-4 p-3 bg-gray-100 rounded-lg">
            <h4 className="font-medium text-sm text-gray-700 mb-2">Debug Information:</h4>
            <div className="text-xs text-gray-600 space-y-1">
              <div>Selected Property: {selectedProperty === 'all' ? 'All Properties' : allProperties.find(p => String(p.property_id) === String(selectedProperty))?.name || 'Unknown'}</div>
              <div>Users Shown: {allUsers.length}</div>
              <div>Total Users Available: {detailedUsers?.length || 0}</div>
              <div>Properties Available: {allProperties.length}</div>
              <div className="text-blue-600 font-medium">
                {selectedProperty === 'all' 
                  ? 'Showing all users across all properties' 
                  : `Showing users assigned to selected property only`
                }
              </div>
            </div>
          </div>
          
          {/* User List */}
          {allUsers.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <h4 className="font-medium text-sm text-gray-700 mb-3">
                {selectedProperty === 'all' 
                  ? 'All Users (All Properties):' 
                  : `Users in ${allProperties.find(p => String(p.property_id) === String(selectedProperty))?.name || 'Selected Property'}:`
                }
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {allUsers.map((user, index) => {
                  const displayName = user.first_name && user.last_name 
                    ? `${user.first_name} ${user.last_name}` 
                    : user.username;
                  const roleInfo = user.positions || user.email || 'No role';
                  
                  return (
                    <div key={`${user.id}-${index}`} className="p-2 sm:p-3 bg-gray-50 rounded-lg border">
                      <div className="font-medium text-xs sm:text-sm truncate">{displayName}</div>
                      <div className="text-xs text-gray-500 truncate">{roleInfo}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Properties: {user.properties?.length || 0}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {allUsers.length === 0 && (
            <div className="mt-6 text-center py-8 text-gray-500">
              <p>No users found.</p>
              <p className="text-sm">Try selecting "All Properties" or check the console for debugging information.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="rooms-by-topics" className="space-y-4">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
          <TabsTrigger value="rooms-by-topics" className="text-xs sm:text-sm">Rooms by Topics</TabsTrigger>
          <TabsTrigger value="topics-by-rooms" className="text-xs sm:text-sm">Topics by Rooms</TabsTrigger>
          <TabsTrigger value="topic-room-filter" className="text-xs sm:text-sm">Topic-Room Filter</TabsTrigger>
        </TabsList>

        {/* Rooms by Topics Tab */}
        <TabsContent value="rooms-by-topics" className="space-y-4">
          {/* Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Top Rooms by Job Count</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[250px] sm:h-[300px] lg:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roomTopicChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="room" 
                      tick={{ fontSize: 10 }} 
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalJobs" fill="#8884d8" name="Total Jobs" />
                    <Bar dataKey="topTopicCount" fill="#82ca9d" name="Top Topic Jobs" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Room Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {filteredRoomTopicData.map((roomData, index) => (
              <Card key={`${roomData.room.room_id}-${roomData.room.name}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="truncate">{roomData.room.name}</span>
                    <Badge variant="secondary" className="w-fit">
                      {roomData.room.room_type}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {roomData.totalJobs} total jobs
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs sm:text-sm">Topics in this room:</h4>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {roomData.topics.slice(0, 4).map((topicData) => (
                        <Badge key={topicData.topic.id} variant="outline" className="text-xs">
                          {topicData.topic.title} ({topicData.count})
                        </Badge>
                      ))}
                      {roomData.topics.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{roomData.topics.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Topics by Rooms Tab */}
        <TabsContent value="topics-by-rooms" className="space-y-4">
          {/* Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Top Topics by Job Count</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[250px] sm:h-[300px] lg:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topicRoomChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="topic" 
                      tick={{ fontSize: 10 }} 
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalJobs" fill="#8884d8" name="Total Jobs" />
                    <Bar dataKey="topRoomCount" fill="#82ca9d" name="Top Room Jobs" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Topic Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {filteredTopicRoomData.map((topicData, index) => (
              <Card key={`${topicData.topic.id}-${topicData.topic.title}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">
                    {topicData.topic.title}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {topicData.topic.description || 'No description'}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {topicData.totalJobs} total jobs
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs sm:text-sm">Rooms with this topic:</h4>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {topicData.rooms.slice(0, 4).map((roomData) => (
                        <Badge key={roomData.room.room_id} variant="outline" className="text-xs">
                          {roomData.room.name} ({roomData.count})
                        </Badge>
                      ))}
                      {topicData.rooms.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{topicData.rooms.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Topic-Room Filter Tab */}
        <TabsContent value="topic-room-filter" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Advanced Topic-Room Filtering</CardTitle>
              <p className="text-xs sm:text-sm text-gray-600">
                Filter rooms by specific topics and see detailed statistics
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                {/* Topic Selection for Room Filtering */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Select Topic to Filter Rooms
                    </label>
                    <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a topic to filter rooms" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Topics</SelectItem>
                        {allTopics.map((topic, index) => (
                          <SelectItem key={`filter-topic-${topic.id}-${index}`} value={topic.id.toString()}>
                            {topic.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Property Filter
                    </label>
                    <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Properties</SelectItem>
                        {allProperties.map((property, index) => (
                          <SelectItem key={`filter-property-${property.property_id}-${index}`} value={String(property.property_id)}>
                            {property.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Filter Results */}
                {selectedTopic !== 'all' && (
                  <div className="mt-4 sm:mt-6">
                    <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                      Rooms with Topic: {allTopics.find(t => t.id.toString() === selectedTopic)?.title}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {filteredRoomTopicData.map((roomData) => {
                        const topicData = roomData.topics.find(t => t.topic.id.toString() === selectedTopic);
                        if (!topicData) return null;

                        return (
                          <Card key={`filter-${roomData.room.room_id}`} className="border-l-4 border-l-blue-500">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm sm:text-base flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <span className="truncate">{roomData.room.name}</span>
                                <Badge variant="secondary" className="w-fit text-xs">{roomData.room.room_type}</Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs sm:text-sm">
                                  <span className="text-gray-600">Topic Jobs:</span>
                                  <span className="font-medium">{topicData.count}</span>
                                </div>
                                <div className="flex justify-between text-xs sm:text-sm">
                                  <span className="text-gray-600">Total Jobs:</span>
                                  <span className="font-medium">{roomData.totalJobs}</span>
                                </div>
                                <div className="flex justify-between text-xs sm:text-sm">
                                  <span className="text-gray-600">Percentage:</span>
                                  <span className="font-medium">{topicData.percentage}%</span>
                                </div>
                                <div className="mt-2">
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-blue-500 h-2 rounded-full" 
                                      style={{ width: `${topicData.percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                    
                    {filteredRoomTopicData.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <p>No rooms found with the selected topic.</p>
                        <p className="text-sm">Try selecting a different topic or property.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Room Selection for Topic Filtering */}
                {selectedRoom !== 'all' && (
                  <div className="mt-4 sm:mt-6">
                    <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                      Topics in Room: {allRooms.find(r => r.room_id.toString() === selectedRoom)?.name}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {filteredTopicRoomData.map((topicData) => {
                        const roomData = topicData.rooms.find(r => r.room.room_id.toString() === selectedRoom);
                        if (!roomData) return null;

                        return (
                          <Card key={`filter-topic-${topicData.topic.id}`} className="border-l-4 border-l-green-500">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm sm:text-base">{topicData.topic.title}</CardTitle>
                              <p className="text-xs sm:text-sm text-gray-600">{topicData.topic.description || 'No description'}</p>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs sm:text-sm">
                                  <span className="text-gray-600">Room Jobs:</span>
                                  <span className="font-medium">{roomData.count}</span>
                                </div>
                                <div className="flex justify-between text-xs sm:text-sm">
                                  <span className="text-gray-600">Total Jobs:</span>
                                  <span className="font-medium">{topicData.totalJobs}</span>
                                </div>
                                <div className="flex justify-between text-xs sm:text-sm">
                                  <span className="text-gray-600">Percentage:</span>
                                  <span className="font-medium">{roomData.percentage}%</span>
                                </div>
                                <div className="mt-2">
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-green-500 h-2 rounded-full" 
                                      style={{ width: `${roomData.percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                    
                    {filteredTopicRoomData.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <p>No topics found in the selected room.</p>
                        <p className="text-sm">Try selecting a different room or property.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RoomTopicFilterPage;
