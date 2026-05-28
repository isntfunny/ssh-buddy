import { createContext, useContext } from 'react';
import type { Profile } from '../profiles/types';

/** Profiles for components dockview renders outside the normal React tree (tabs). */
export const ProfilesContext = createContext<Profile[]>([]);
export const useProfiles = () => useContext(ProfilesContext);
