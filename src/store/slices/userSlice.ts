import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  profile: null, // { id: string, publicKey: string, name: string }
  isRegistered: false,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setProfile(state, action) {
      state.profile = action.payload;
      state.isRegistered = !!action.payload;
    },
    clearProfile(state) {
      state.profile = null;
      state.isRegistered = false;
    },
  },
});

export const { setProfile, clearProfile } = userSlice.actions;
export default userSlice.reducer;
