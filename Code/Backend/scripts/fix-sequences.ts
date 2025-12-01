import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import { fixAllSequences } from '../src/utils/fix-sequences.util';

async function run() {
  try {
    console.log('🚀 Initializing database connection...');
    await AppDataSource.initialize();
    
    console.log('✅ Database connected');
    console.log('');
    
    await fixAllSequences(AppDataSource);
    
    console.log('');
    console.log('✨ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('🔌 Database connection closed');
    }
    process.exit(0);
  }
}

run();

