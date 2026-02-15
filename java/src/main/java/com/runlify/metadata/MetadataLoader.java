package com.runlify.metadata;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;

/**
 * Loads and parses metadata.json into {@link ProjectMetadata}.
 */
@Service
public class MetadataLoader {

    private static final Logger log = LoggerFactory.getLogger(MetadataLoader.class);

    private final ProjectMetadata metadata;

    public MetadataLoader(@Value("${runlify.metadata.path}") String metadataPath) {
        this.metadata = load(metadataPath);
    }

    public ProjectMetadata getMetadata() {
        return metadata;
    }

    private static ProjectMetadata load(String path) {
        var mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        var file = new File(path);
        if (!file.exists()) {
            throw new IllegalStateException("Metadata file not found: " + file.getAbsolutePath());
        }

        try {
            var meta = mapper.readValue(file, ProjectMetadata.class);
            log.info("Loaded metadata '{}': {} catalogs, {} documents, {} infoRegistries, {} sumRegistries",
                meta.name(),
                meta.catalogs().size(),
                meta.documents().size(),
                meta.infoRegistries().size(),
                meta.sumRegistries().size());
            return meta;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to parse metadata: " + file.getAbsolutePath(), e);
        }
    }
}
