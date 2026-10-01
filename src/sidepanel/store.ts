import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { aiReducer } from './aiSlice';
import { changesReducer } from './changesSlice';
import { connectionReducer } from './connectionSlice';
import { selectionReducer } from './selectionSlice';

export const store = configureStore({
  reducer: { connection: connectionReducer, selection: selectionReducer, changes: changesReducer, ai: aiReducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
