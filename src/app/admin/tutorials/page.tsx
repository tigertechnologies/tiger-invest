'use client';
import { Crud } from '../crud';

export default function Page() {
  return (
    <Crud
      title="Tutoriais"
      table="tutorials"
      order={{ col: 'sort', asc: true }}
      fields={[
        { key: 'title', label: 'Título', type: 'text', required: true, list: true },
        { key: 'category', label: 'Categoria', type: 'text', defaultValue: 'Plataforma', list: true },
        { key: 'difficulty', label: 'Dificuldade', type: 'select', options: ['Iniciante', 'Intermediário', 'Avançado'], defaultValue: 'Iniciante', list: true },
        { key: 'duration_min', label: 'Duração (min)', type: 'number', defaultValue: 10 },
        { key: 'video_url', label: 'Link do vídeo', type: 'url', help: 'YouTube, Vimeo ou arquivo .mp4' },
        { key: 'thumbnail_url', label: 'Capa (URL da imagem)', type: 'url' },
        { key: 'premium', label: 'Só assinantes', type: 'bool', list: true },
        { key: 'published', label: 'Publicado', type: 'bool', defaultValue: true, list: true },
        { key: 'sort', label: 'Ordem', type: 'number', defaultValue: 0 },
        { key: 'description', label: 'Descrição', type: 'textarea' },
      ]}
    />
  );
}
