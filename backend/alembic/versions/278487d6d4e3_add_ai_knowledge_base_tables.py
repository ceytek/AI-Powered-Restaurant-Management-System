"""add_ai_knowledge_base_tables

Revision ID: 278487d6d4e3
Create Date: 2026-02-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '278487d6d4e3'
down_revision: Union[str, None] = '52bd8d179c60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ensure pgvector extension exists
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Knowledge Categories
    op.create_table(
        'knowledge_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('display_name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('icon', sa.String(50), nullable=True),
        sa.Column('sort_order', sa.Integer, default=0),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Knowledge Entries (without embedding column - added via raw SQL)
    op.create_table(
        'knowledge_entries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('knowledge_categories.id'), nullable=True),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('short_answer', sa.Text, nullable=True),
        sa.Column('keywords', postgresql.JSONB, server_default='[]'),
        sa.Column('entry_type', sa.String(50), server_default='info'),
        sa.Column('priority', sa.Integer, server_default='0'),
        sa.Column('extra_data', postgresql.JSONB, server_default='{}'),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
    )

    # Menu Embeddings (without embedding column - added via raw SQL)
    op.create_table(
        'menu_embeddings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('menu_item_id', postgresql.UUID(as_uuid=True), nullable=False, unique=True, index=True),
        sa.Column('item_name', sa.String(200), nullable=False),
        sa.Column('item_description', sa.Text, nullable=True),
        sa.Column('category_name', sa.String(200), nullable=True),
        sa.Column('price', sa.Float, nullable=True),
        sa.Column('allergens', postgresql.JSONB, server_default='[]'),
        sa.Column('tags', postgresql.JSONB, server_default='[]'),
        sa.Column('is_available', sa.Boolean, server_default='true'),
        sa.Column('embedded_text', sa.Text, nullable=False),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # Conversation Logs
    op.create_table(
        'conversation_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('session_id', sa.String(100), nullable=False, index=True),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('tool_calls', postgresql.JSONB, nullable=True),
        sa.Column('tool_name', sa.String(100), nullable=True),
        sa.Column('input_type', sa.String(20), server_default='text'),
        sa.Column('tokens_used', sa.Integer, nullable=True),
        sa.Column('latency_ms', sa.Integer, nullable=True),
        sa.Column('customer_phone', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # Add vector columns using raw SQL (Alembic doesn't natively support pgvector type)
    op.execute("ALTER TABLE knowledge_entries ADD COLUMN embedding vector(1536)")
    op.execute("ALTER TABLE menu_embeddings ADD COLUMN embedding vector(1536)")

    # Create vector indexes for fast cosine similarity search (IVFFlat)
    # Note: IVFFlat requires rows to exist first for training. For small datasets, use HNSW instead.
    op.execute("""
        CREATE INDEX idx_knowledge_entries_embedding 
        ON knowledge_entries USING hnsw (embedding vector_cosine_ops)
    """)
    op.execute("""
        CREATE INDEX idx_menu_embeddings_embedding 
        ON menu_embeddings USING hnsw (embedding vector_cosine_ops)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_menu_embeddings_embedding")
    op.execute("DROP INDEX IF EXISTS idx_knowledge_entries_embedding")
    op.drop_table('conversation_logs')
    op.drop_table('menu_embeddings')
    op.drop_table('knowledge_entries')
    op.drop_table('knowledge_categories')
