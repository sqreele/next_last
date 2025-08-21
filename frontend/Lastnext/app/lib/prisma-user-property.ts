import { prisma } from "@/app/lib/prisma";
import { Property } from "@/app/lib/types";

/**
 * Fetch user's properties directly from the database using the many-to-many relationship
 * This handles properties through UserProperty join table
 */
export async function getUserProperties(userId: string): Promise<Property[]> {
  try {
    // Find the user's profile first (Django-mapped schema)
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId: parseInt(userId) },
      select: { id: true },
    });

    if (!userProfile) {
      return [];
    }

    // Query through the join table directly
    const propertiesFromJoin = await prisma.userProfileProperty.findMany({
      where: { userprofileId: userProfile.id },
      include: { property: true },
    });

    if (!Array.isArray(propertiesFromJoin) || propertiesFromJoin.length === 0) {
      return [];
    }

    return propertiesFromJoin.map((relation) => {
      const prop = relation.property;
      return {
        id: prop.id,
        property_id: String(prop.id),
        name: prop.name || `Property ${prop.id}`,
        description: prop.description || "",
        created_at:
          typeof (prop as any).created_at === 'object' && (prop as any).created_at !== null
            ? (prop as any).created_at.toISOString()
            : ((prop as any).created_at || new Date().toISOString()),
      };
    });
  } catch (error) {
    console.error("Error fetching user properties:", error);
    return [];
  }
}

/**
 * Associate a user with a property
 * This will handle the many-to-many relationship
 */
export async function addUserToProperty(userId: string, propertyId: string): Promise<void> {
  // Resolve the user's profile id from the Django-mapped schema
  const userProfile = await prisma.userProfile.findUnique({
    where: { userId: parseInt(userId) },
    select: { id: true },
  });

  if (!userProfile) {
    return;
  }

  // First check if the relationship already exists
  const existingRelation = await prisma.userProfileProperty.findUnique({
    where: {
      userprofileId_propertyId: {
        userprofileId: userProfile.id,
        propertyId: propertyId,
      },
    },
  });

  // If it doesn't exist, create it
  if (!existingRelation) {
    await prisma.userProfileProperty.create({
      data: {
        userprofileId: userProfile.id,
        propertyId: propertyId,
      },
    });
  }
}

/**
 * Create a new property and associate it with a user
 */
export async function createPropertyForUser(
  userId: string, 
  propertyData: { name: string; description?: string }
): Promise<Property> {
  // Resolve the user's profile id
  const userProfile = await prisma.userProfile.findUnique({
    where: { userId: parseInt(userId) },
    select: { id: true },
  });

  // Create the property (id is required in Django-mapped schema)
  const generatedId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const newProperty = await prisma.property.create({
    data: {
      id: generatedId,
      name: propertyData.name,
      description: propertyData.description || null,
    },
  });

  // Create the relationship if we have a user profile
  if (userProfile) {
    try {
      await prisma.userProfileProperty.create({
        data: {
          userprofileId: userProfile.id,
          propertyId: newProperty.id,
        },
      });
    } catch (error) {
      console.error("Error creating relationship, may already exist:", error);
    }
  }

  return {
    id: newProperty.id,
    property_id: newProperty.id,
    name: newProperty.name || `Property ${newProperty.id}`,
    description: newProperty.description || "",
    created_at:
      typeof (newProperty as any).created_at === 'object' && (newProperty as any).created_at !== null
        ? (newProperty as any).created_at.toISOString()
        : ((newProperty as any).created_at || new Date().toISOString()),
  };
}

/**
 * Synchronize properties from API to the local database
 */
export async function syncUserProperties(
  userId: string, 
  apiProperties: any[]
): Promise<Property[]> {
  if (!apiProperties || !apiProperties.length) {
    return [];
  }

  // Resolve the user's profile id
  const userProfile = await prisma.userProfile.findUnique({
    where: { userId: parseInt(userId) },
    select: { id: true },
  });

  if (!userProfile) {
    return [];
  }

  // First, create or update all properties from the API
  const propertyPromises = apiProperties.map(async (prop) => {
    const propertyId = String(prop.property_id || prop.id);
    const name = prop.name || `Property ${propertyId}`;
    
    // Upsert the property
    const property = await prisma.property.upsert({
      where: { id: propertyId },
      update: {
        name,
        description: prop.description || null,
      },
      create: {
        id: propertyId,
        name,
        description: prop.description || null,
      },
    });

    // Check if the relationship exists
    const existingRelation = await prisma.userProfileProperty.findUnique({
      where: {
        userprofileId_propertyId: {
          userprofileId: userProfile.id,
          propertyId: property.id,
        },
      },
    });

    // If relationship doesn't exist, create it
    if (!existingRelation) {
      await prisma.userProfileProperty.create({
        data: {
          userprofileId: userProfile.id,
          propertyId: property.id,
        },
      });
    }

    return property;
  });

  // Wait for all property operations to complete
  const results = await Promise.all(propertyPromises);
  
  // Convert to our application Property type
  return results.map(prop => ({
    id: prop.id,
    property_id: prop.id,
    name: prop.name || `Property ${prop.id}`,
    description: prop.description || "",
    created_at: typeof prop.created_at === 'object' && prop.created_at !== null 
      ? prop.created_at.toISOString()
      : (prop.created_at || new Date().toISOString()),
  }));
}