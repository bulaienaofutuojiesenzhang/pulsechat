import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  profile: null, // { id: string, publicKey: string, privateKey: string, name: string }
  isRegistered: false,
  passphrase: '123456', // 全局加解密密钥 (Passphrase)
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
      state.passphrase = '123456';
    },
    setPassphrase(state, action) {
      state.passphrase = action.payload;
    },
  },
});

export const { setProfile, clearProfile } = userSlice.actions;
export default userSlice.reducer;
