// Import auth providers
// import { arcadeAuth } from './providers/arcade';
// import { composioAuth } from './providers/composio';
import { MastraAuthFirebase } from '@mastra/auth-firebase';
import { MastraAuthSupabase } from '@mastra/auth-supabase';
import { MastraAuthWorkos } from '@mastra/auth-workos';
// import { supertokensAuth } from './providers/supertokens';
// import { workosAuth } from './providers/workos';
// import { clerkAuth } from './providers/clerk';
// import { auth0Auth } from './providers/auth0';

// Get the configured auth provider based on environment
export function getAuthProvider() {
  const provider = process.env.AUTH_PROVIDER?.toLowerCase() || 'supabase';

  switch (provider) {
    case 'firebase':
      return new MastraAuthFirebase();
    case 'workos':
      return new MastraAuthWorkos();
    // case 'composio':
    //   return composioAuth;
    // case 'supertokens':
    //   return supertokensAuth;
    // case 'arcade':
    //   return arcadeAuth;
    // case 'clerk':
    //   return clerkAuth;
    // case 'auth0':
    //   return auth0Auth;
    case 'supabase':
    default:
      return new MastraAuthSupabase(); // Default to Supabase
  }
}

export const authConfig = getAuthProvider();
