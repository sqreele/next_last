import React from 'react';
import { Metadata } from 'next';
import { getServerSession } from '@/app/lib/session.server';
import { fetchAllRooms, fetchAllTopics, fetchAllJobsForDashboard, ServerApiError } from '@/app/lib/data.server';
import { jobsApi, JobsApiError } from '@/app/lib/api/jobsApi';
import RoomsByTopicClient, { RoomsByTopicLoadError } from './room-topic-client';
import { generatePageMetadata } from '@/app/lib/seo-config';
import type { Job, Property, Room, Topic } from '@/app/lib/types';

export const dynamic = 'force-dynamic';

// SEO Metadata for Rooms by Topic
export const metadata: Metadata = generatePageMetadata('roomsByTopic');

type LoadResult<T> = {
  data: T;
  error: RoomsByTopicLoadError | null;
};

const emptyArray = <T,>(): T[] => [];

function getFriendlyLoadError(source: string, error: unknown): RoomsByTopicLoadError {
  const status = error instanceof ServerApiError || error instanceof JobsApiError ? error.status : undefined;
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown error');

  if (status === 401) {
    return {
      source,
      status,
      title: 'Please sign in again',
      message: 'Your login session has expired. Sign in again, then retry loading rooms by topic.',
    };
  }

  if (status === 403) {
    return {
      source,
      status,
      title: 'You do not have access to this data',
      message: 'Your account does not have permission to view rooms, topics, or jobs for this property.',
    };
  }

  if (status === 404) {
    return {
      source,
      status,
      title: 'Rooms by topic data was not found',
      message: 'The server endpoint for this dashboard data could not be found. Please contact support if this continues.',
    };
  }

  if (status && status >= 500) {
    return {
      source,
      status,
      title: 'Dashboard data is temporarily unavailable',
      message: 'The server had trouble loading this data. Please retry in a moment.',
    };
  }

  if (/timeout|abort/i.test(rawMessage)) {
    return {
      source,
      status: 408,
      title: 'Loading took too long',
      message: 'The connection to the server timed out. Please check your network and retry.',
    };
  }

  return {
    source,
    status,
    title: 'Could not load all rooms by topic data',
    message: 'Some dashboard data could not be loaded. You can retry without leaving this page.',
  };
}

async function safeLoad<T>(
  source: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<LoadResult<T>> {
  try {
    const data = await loader();
    return { data: data ?? fallback, error: null };
  } catch (error) {
    console.error(`Rooms by topic: failed to load ${source}`, error);
    return { data: fallback, error: getFriendlyLoadError(source, error) };
  }
}

export default async function RoomsByTopicPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;

  if (!accessToken) {
    return (
      <div className="w-full">
        <RoomsByTopicClient
          rooms={[]}
          topics={[]}
          properties={[]}
          jobs={[]}
          authRequired
          loadErrors={[]}
        />
      </div>
    );
  }

  const [roomsResult, topicsResult, propertiesResult, jobsResult] = await Promise.all([
    safeLoad<Room[]>('rooms', () => fetchAllRooms(accessToken), emptyArray<Room>()),
    safeLoad<Topic[]>('topics', () => fetchAllTopics(accessToken), emptyArray<Topic>()),
    safeLoad<Property[]>('properties', () => jobsApi.getProperties(accessToken), emptyArray<Property>()),
    safeLoad<Job[]>('jobs', () => fetchAllJobsForDashboard(accessToken), emptyArray<Job>()),
  ]);

  const loadErrors = [roomsResult.error, topicsResult.error, propertiesResult.error, jobsResult.error].filter(
    (error): error is RoomsByTopicLoadError => Boolean(error),
  );

  return (
    <div className="w-full">
      <RoomsByTopicClient
        rooms={Array.isArray(roomsResult.data) ? roomsResult.data : []}
        topics={Array.isArray(topicsResult.data) ? topicsResult.data : []}
        properties={Array.isArray(propertiesResult.data) ? propertiesResult.data : []}
        jobs={Array.isArray(jobsResult.data) ? jobsResult.data : []}
        loadErrors={loadErrors}
      />
    </div>
  );
}
